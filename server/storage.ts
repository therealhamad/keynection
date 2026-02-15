import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import {
  users, integrations, actionLogs,
  type User, type InsertUser,
  type Integration, type InsertIntegration,
  type ActionLog, type InsertActionLog,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getIntegrations(): Promise<Integration[]>;
  getIntegration(id: number): Promise<Integration | undefined>;
  createIntegration(data: InsertIntegration): Promise<Integration>;
  updateIntegration(id: number, data: Partial<InsertIntegration>): Promise<Integration | undefined>;
  getActionLogs(): Promise<ActionLog[]>;
  createActionLog(data: InsertActionLog): Promise<ActionLog>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getIntegrations(): Promise<Integration[]> {
    return db.select().from(integrations).orderBy(integrations.name);
  }

  async getIntegration(id: number): Promise<Integration | undefined> {
    const [integration] = await db.select().from(integrations).where(eq(integrations.id, id));
    return integration;
  }

  async createIntegration(data: InsertIntegration): Promise<Integration> {
    const [integration] = await db.insert(integrations).values(data).returning();
    return integration;
  }

  async updateIntegration(id: number, data: Partial<InsertIntegration>): Promise<Integration | undefined> {
    const [updated] = await db.update(integrations).set(data).where(eq(integrations.id, id)).returning();
    return updated;
  }

  async getActionLogs(): Promise<ActionLog[]> {
    return db.select().from(actionLogs).orderBy(desc(actionLogs.createdAt));
  }

  async createActionLog(data: InsertActionLog): Promise<ActionLog> {
    const [log] = await db.insert(actionLogs).values(data).returning();
    return log;
  }
}

export const storage = new DatabaseStorage();
