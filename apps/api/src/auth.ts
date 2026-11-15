import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { cfg } from './config';

const TTL = 12 * 60 * 60;

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const h: string = req.headers['authorization'] || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
    try {
      jwt.verify(tok, cfg.jwtSecret, { algorithms: ['HS256'] });
      return true;
    } catch {
      throw new UnauthorizedException('Sign in required');
    }
  }
}

const fails = new Map<string, { n: number; until: number }>();
const MAX = 8;
const WINDOW = 15 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Controller('auth')
export class AuthController {
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { password?: string }, @Req() req: any) {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    const now = Date.now();
    let f = fails.get(ip);
    if (f && f.until < now) { fails.delete(ip); f = undefined; }
    if (f && f.n >= MAX) throw new HttpException('Too many attempts. Try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    const pw = typeof body?.password === 'string' ? body.password : '';
    const ok = !!pw && !!cfg.passwordHash && (await bcrypt.compare(pw, cfg.passwordHash));
    if (!ok) {
      fails.set(ip, { n: (f?.n || 0) + 1, until: f?.until ?? now + WINDOW });
      await sleep(700);
      throw new UnauthorizedException('Incorrect password');
    }
    fails.delete(ip);
    const token = jwt.sign({ sub: 'groundwork' }, cfg.jwtSecret, { algorithm: 'HS256', expiresIn: TTL });
    return { token, expiresIn: TTL };
  }

  @Get('check')
  check(@Req() req: any) {
    new AuthGuard().canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as any);
    return { ok: true };
  }
}
