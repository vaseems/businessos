import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post,
  Req, ServiceUnavailableException, UseGuards,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AdminGuard, SessionService, type SessionUser } from './auth';
import { rpc } from './rpc';

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** A random temporary password without look-alike characters. */
export const tempPassword = (n = 14) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const id = (v: string) => {
  if (!UUID.test(v)) throw new BadRequestException('Bad request');
  return v.toLowerCase();
};

async function call<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
  let out: any;
  try {
    out = await rpc(fn, args);
  } catch {
    throw new ServiceUnavailableException('Could not reach the user database. Try again.');
  }
  if (out && typeof out === 'object' && 'error' in out) {
    switch (out.error) {
      case 'duplicate': throw new ConflictException('That username is already taken');
      case 'invalid': throw new BadRequestException('Bad value');
      case 'not_found': throw new NotFoundException('User not found');
      case 'protected': throw new BadRequestException('The administrator account cannot be disabled or deleted');
      default: throw new BadRequestException('Bad request');
    }
  }
  return out as T;
}

/**
 * Who may change whom:
 * - Every administrator can add members and manage members (rename, disable, reset password, delete).
 * - Only the initial administrator can tag or untag administrators and manage other administrators.
 * - Nobody can disable, delete or demote their own account, and the initial administrator is fixed.
 */
@UseGuards(AdminGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly s: SessionService) {}

  private async target(uid: string, actor: SessionUser, what: 'edit' | 'self-block' | 'admin-only'): Promise<SessionUser> {
    const t = await call<SessionUser | null>('app_user_get', { p_id: id(uid) });
    if (!t) throw new NotFoundException('User not found');
    if (what === 'self-block' && t.id === actor.id) throw new BadRequestException('You cannot do that to your own account');
    if (t.role === 'admin' && t.id !== actor.id && !actor.is_initial) throw new ForbiddenException('Only the initial administrator can manage other administrators');
    if (what === 'admin-only' && !actor.is_initial) throw new ForbiddenException('Only the initial administrator can tag administrators');
    return t;
  }

  @Get()
  list() {
    return call<any[]>('app_users_list').then((users) => ({ users }));
  }

  @Post()
  async create(@Body() body: { username?: string; name?: string }) {
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
    if (!USERNAME.test(username)) throw new BadRequestException('Username: 3 to 32 characters, lowercase letters, numbers, dot, dash or underscore');
    const pw = tempPassword();
    const user = await call('app_user_create', { p_username: username, p_name: name, p_hash: await bcrypt.hash(pw, 10) });
    return { user, tempPassword: pw };
  }

  @Patch(':id')
  async update(@Param('id') uid: string, @Body() body: { name?: string; active?: boolean; role?: string }, @Req() req: any) {
    const actor = req.user as SessionUser;
    const active = typeof body?.active === 'boolean' ? body.active : null;
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : null;
    const role = body?.role === undefined ? null : body.role;
    if (role !== null && role !== 'admin' && role !== 'member') throw new BadRequestException('Role must be admin or member');
    if (active === null && name === null && role === null) throw new BadRequestException('Nothing to change');
    const t = await this.target(uid, actor, role !== null ? 'admin-only' : active === false ? 'self-block' : 'edit');
    if (role !== null && t.id === actor.id) throw new BadRequestException('You cannot change your own role');
    let user: any = t;
    if (active !== null || name !== null) user = await call('app_user_update', { p_id: t.id, p_name: name, p_active: active });
    if (role !== null && role !== t.role) user = await call('app_user_set_role', { p_id: t.id, p_role: role });
    this.s.forget(t.id);
    return { user };
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  async reset(@Param('id') uid: string, @Req() req: any) {
    const t = await this.target(uid, req.user, 'edit');
    if (t.id === (req.user as SessionUser).id || t.is_initial) throw new BadRequestException('Passwords for your own account are changed under Account');
    const pw = tempPassword();
    const user = await call('app_user_set_hash', { p_id: t.id, p_hash: await bcrypt.hash(pw, 10) });
    this.s.forget(t.id);
    return { user, tempPassword: pw };
  }

  @Delete(':id')
  async remove(@Param('id') uid: string, @Req() req: any) {
    const t = await this.target(uid, req.user, 'self-block');
    await call('app_user_delete', { p_id: t.id });
    this.s.forget(t.id);
    return { ok: true };
  }
}
