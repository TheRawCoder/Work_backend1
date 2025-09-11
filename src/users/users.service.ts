import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';

@Injectable()
export class UsersService {
  getUserStats() {
    throw new Error('Method not implemented.');
  }
  private users: any[] = []; // in-memory store for simplicity

  async create(user: any) {
    const newUser = { ...user, _id: uuid() };
    this.users.push(newUser);
    return newUser;
  }

  async findAll() {
    return this.users;
  }

  async findOne(id: string) {
    const user = this.users.find(u => u._id === id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string) {
    return this.users.find(u => u.email === email);
  }
}
