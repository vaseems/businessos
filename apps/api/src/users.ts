import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post,
  ServiceUnavailableException, UseGuards,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AdminGuard, SessionService } from './auth';
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
      case 'invalid': throw new BadRequestException('Bad username or name');
      case 'not_found': throw new NotFoundException('User not found');
      case 'protected': throw new BadRequestException('The administrator account cannot be disabled or deleted');
      default: throw new BadRequestException('Bad request');
    }
  }
  return out as T;
}

@UseGuards(AdminGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly s: SessionService) {}

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
  async update(@Param('id') uid: string, @Body() body: { name?: string; active?: boolean }) {
    const active = typeof body?.active === 'boolean' ? body.active : null;
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : null;
    if (active === null && name === null) throw new BadRequestException('Nothing to change');
    const user = await call('app_user_update', { p_id: id(uid), p_name: name, p_active: active });
    this.s.forget(id(uid));
    return { user };
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  async reset(@Param('id') uid: string) {
    const pw = tempPassword();
    const user = await call('app_user_set_hash', { p_id: id(uid), p_hash: await bcrypt.hash(pw, 10) });
    this.s.forget(id(uid));
    return { user, tempPassword: pw };
  }

  @Delete(':id')
  async remove(@Param('id') uid: string) {
    await call('app_user_delete', { p_id: id(uid) });
    this.s.forget(id(uid));
    return { ok: true };
  }
}
