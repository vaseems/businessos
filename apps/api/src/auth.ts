import {
  BadRequestException, CanActivate, Body, Controller, ExecutionContext, ForbiddenException, Get, HttpCode, HttpException,
  HttpStatus, Injectable, Post, Req, ServiceUnavailableException, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { cfg } from './config';
import { rpc, RpcError } from './rpc';

export const TTL = 12 * 60 * 60;
const STATUS_TTL = 30 * 1000;
/** Compared against when the user does not exist, so unknown and known usernames take similar time. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export interface SessionUser { id: string; username: string; name: string | null; role: 'admin' | 'member'; is_initial: boolean; active: boolean; pw_changed_at: string }

export const sessionBody = (u: SessionUser) => ({ id: u.id, username: u.username, name: u.name, role: u.role, isInitial: u.is_initial });

/** Signs a session token. iat is never earlier than the last password change, so a fresh token is not revoked by it. */
export function signToken(u: SessionUser): string {
  const iat = Math.max(Math.floor(Date.now() / 1000), Math.floor(Date.parse(u.pw_changed_at) / 1000) || 0);
  return jwt.sign({ sub: u.id, role: u.role, username: u.username, iat }, cfg.jwtSecret, { algorithm: 'HS256', expiresIn: TTL });
}

@Injectable()
export class SessionService {
  private cache = new Map<string, { at: number; u: SessionUser | null }>();

  forget(id: string) { this.cache.delete(id); }

  async user(id: string, fresh = false): Promise<SessionUser | null> {
    const hit = this.cache.get(id);
    if (!fresh && hit && Date.now() - hit.at < STATUS_TTL) return hit.u;
    let u: SessionUser | null;
    try {
      u = await rpc<SessionUser | null>('app_user_get', { p_id: id });
    } catch (e) {
      if (hit) return hit.u; // keep serving the last known state through a short outage
      throw new ServiceUnavailableException('Could not verify your session. Try again.');
    }
    this.cache.set(id, { at: Date.now(), u });
    return u;
  }

  /** Verifies the bearer token and that the account is still active and was not given a new password since. */
  async verify(req: any, fresh = false): Promise<SessionUser> {
    const h: string = req.headers['authorization'] || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
    let claims: any;
    try {
      claims = jwt.verify(tok, cfg.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Sign in required');
    }
    if (typeof claims?.sub !== 'string') throw new UnauthorizedException('Sign in required');
    const u = await this.user(claims.sub, fresh);
    const changed = Math.floor(Date.parse(u?.pw_changed_at ?? '') / 1000) || 0;
    if (!u || !u.active || (claims.iat ?? 0) < changed) throw new UnauthorizedException('Sign in required');
    req.user = u;
    return u;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly s: SessionService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await this.s.verify(ctx.switchToHttp().getRequest());
    return true;
  }
}

/** Only the initial administrator. Always checked against the database, never the cache. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly s: SessionService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const u = await this.s.verify(ctx.switchToHttp().getRequest(), true);
    if (!u.is_initial || u.role !== 'admin') throw new ForbiddenException('Only the administrator can do this');
    return true;
  }
}

const fails = new Map<string, { n: number; until: number }>();
const MAX = 8;
const WINDOW = 15 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export const MIN_PW = 10;
export const MAX_PW = 72; // bcrypt ignores everything past 72 bytes

export function checkNewPassword(pw: unknown): string {
  if (typeof pw !== 'string' || pw.length < MIN_PW) throw new BadRequestException(`Use at least ${MIN_PW} characters`);
  if (Buffer.byteLength(pw) > MAX_PW) throw new BadRequestException(`Use at most ${MAX_PW} characters`);
  return pw;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly s: SessionService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { username?: string; password?: string }, @Req() req: any) {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    const now = Date.now();
    let f = fails.get(ip);
    if (f && f.until < now) { fails.delete(ip); f = undefined; }
    if (f && f.n >= MAX) throw new HttpException('Too many attempts. Try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    const pw = typeof body?.password === 'string' ? body.password : '';
    const bad = async () => {
      fails.set(ip, { n: (f?.n || 0) + 1, until: f?.until ?? now + WINDOW });
      await sleep(700);
      throw new UnauthorizedException('Incorrect username or password');
    };
    if (!USERNAME.test(username) || !pw || Buffer.byteLength(pw) > 1024) return bad();

    let row: (SessionUser & { password_hash?: string }) | null;
    try {
      row = await rpc('app_user_login_get', { p_username: username });
    } catch (e) {
      throw new ServiceUnavailableException('Sign-in is unavailable right now. Try again shortly.');
    }

    let user: SessionUser | null = null;
    if (row) {
      const ok = await bcrypt.compare(pw, row.password_hash || DUMMY_HASH);
      if (ok && row.active) user = row;
    } else if (username === cfg.adminUsername && cfg.passwordHash) {
      // First sign-in of the initial administrator: the password from PASSWORD_HASH creates the account.
      const ok = await bcrypt.compare(pw, cfg.passwordHash);
      if (ok) {
        try {
          user = await rpc<SessionUser | null>('app_user_bootstrap', { p_username: username, p_hash: cfg.passwordHash });
        } catch {
          throw new ServiceUnavailableException('Sign-in is unavailable right now. Try again shortly.');
        }
      }
    } else {
      await bcrypt.compare(pw, DUMMY_HASH); // keep timing similar for unknown users
    }
    if (!user) return bad();

    fails.delete(ip);
    this.s.forget(user.id);
    rpc('app_user_touch', { p_id: user.id }).catch(() => undefined);
    return { token: signToken(user), expiresIn: TTL, user: sessionBody(user) };
  }

  @UseGuards(AuthGuard)
  @Get('check')
  check(@Req() req: any) {
    return { ok: true, user: sessionBody(req.user) };
  }

  /** Change the signed-in user's own password. Old tokens stop working, so a new one is returned. */
  @UseGuards(AuthGuard)
  @Post('password')
  @HttpCode(200)
  async password(@Body() body: { current?: string; next?: string }, @Req() req: any) {
    const u: SessionUser = req.user;
    const next = checkNewPassword(body?.next);
    const current = typeof body?.current === 'string' ? body.current : '';
    let hash: string | null;
    try {
      hash = await rpc<string | null>('app_user_hash', { p_id: u.id });
    } catch {
      throw new ServiceUnavailableException('Could not change the password. Try again.');
    }
    if (!hash || !current || !(await bcrypt.compare(current, hash))) {
      await sleep(700);
      throw new UnauthorizedException('Your current password is not right');
    }
    if (current === next) throw new BadRequestException('Choose a password you have not used here');
    const out: any = await rpc('app_user_set_hash', { p_id: u.id, p_hash: await bcrypt.hash(next, 10) }).catch((e) => {
      throw e instanceof RpcError ? new ServiceUnavailableException('Could not change the password. Try again.') : e;
    });
    if (out?.error) throw new BadRequestException('Could not change the password');
    this.s.forget(u.id);
    return { ok: true, token: signToken(out), expiresIn: TTL };
  }
}
