import { randomUUID } from 'crypto';

type WhereUnique<T extends Record<string, unknown>> = Partial<T>;

function now(): Date {
  return new Date();
}

function matches<T extends Record<string, unknown>>(item: T, where?: WhereUnique<T>): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'gt' in value) {
      return (item[key] as any) > (value as { gt: any }).gt;
    }
    return item[key] === value;
  });
}

function normalizeCreateData<T extends Record<string, unknown>>(data: T): T {
  const copy = { ...data };
  delete (copy as Record<string, unknown>).profile;
  return copy;
}

class InMemoryDelegate<T extends Record<string, unknown>> {
  constructor(
    private readonly rows: T[],
    private readonly afterCreate?: (row: T, data: Record<string, unknown>) => void | Promise<void>,
  ) {}

  async create(args: { data: Record<string, unknown> }): Promise<T> {
    const date = now();
    const row = {
      id: randomUUID(),
      createdAt: date,
      updatedAt: date,
      ...normalizeCreateData(args.data),
    } as unknown as T;
    this.rows.push(row);
    await this.afterCreate?.(row, args.data);
    return row;
  }

  async findUnique(args: { where: WhereUnique<T>; include?: Record<string, unknown> }): Promise<T | null> {
    return this.rows.find((row) => matches(row, args.where)) ?? null;
  }

  async findFirst(args: { where?: WhereUnique<T>; orderBy?: Record<string, 'asc' | 'desc'> } = {}): Promise<T | null> {
    const found = this.filterRows(args.where, args.orderBy);
    return found[0] ?? null;
  }

  async findMany(args: { where?: WhereUnique<T>; orderBy?: Record<string, 'asc' | 'desc'> } = {}): Promise<T[]> {
    return this.filterRows(args.where, args.orderBy);
  }

  async update(args: { where: WhereUnique<T>; data: Partial<T> }): Promise<T> {
    const row = await this.findUnique({ where: args.where });
    if (!row) throw new Error('Record not found');
    Object.assign(row, args.data, { updatedAt: now() });
    return row;
  }

  async upsert(args: { where: WhereUnique<T>; create: Record<string, unknown>; update: Partial<T> }): Promise<T> {
    const existing = await this.findUnique({ where: args.where });
    if (existing) {
      Object.assign(existing, args.update, { updatedAt: now() });
      return existing;
    }
    return this.create({ data: args.create });
  }

  async count(args: { where?: WhereUnique<T> } = {}): Promise<number> {
    return this.filterRows(args.where).length;
  }

  private filterRows(where?: WhereUnique<T>, orderBy?: Record<string, 'asc' | 'desc'>): T[] {
    const result = this.rows.filter((row) => matches(row, where));
    if (orderBy) {
      const [[field, direction]] = Object.entries(orderBy);
      result.sort((a, b) => {
        const left = a[field] as Date | bigint | number | string;
        const right = b[field] as Date | bigint | number | string;
        if (left === right) return 0;
        const order = left > right ? 1 : -1;
        return direction === 'asc' ? order : -order;
      });
    }
    return result;
  }
}

export class InMemoryPrismaService {
  readonly users: any[] = [];
  readonly profiles: any[] = [];
  readonly refreshSessions: any[] = [];
  readonly records: any[] = [];
  readonly dailySummaries: any[] = [];
  readonly dailyMoods: any[] = [];
  readonly insightReports: any[] = [];
  readonly weeklyInsights: any[] = [];
  readonly syncChanges: any[] = [];
  readonly smsLoginAttempts: any[] = [];

  user = new InMemoryDelegate(this.users, async (user, data) => {
    const profile = data.profile as { create?: Record<string, unknown> } | undefined;
    if (profile?.create) {
      await this.userProfile.create({
        data: {
          userId: user.id,
          ...profile.create,
        },
      });
    }
  });

  userProfile = new InMemoryDelegate(this.profiles);
  refreshSession = new InMemoryDelegate(this.refreshSessions);
  record = new InMemoryDelegate(this.records);
  dailySummary = new InMemoryDelegate(this.dailySummaries);
  dailyMood = new InMemoryDelegate(this.dailyMoods);
  insightReport = new InMemoryDelegate(this.insightReports);
  weeklyInsight = new InMemoryDelegate(this.weeklyInsights);
  syncChange = new InMemoryDelegate(this.syncChanges);
  smsLoginAttempt = new InMemoryDelegate(this.smsLoginAttempts);

  async $transaction<T>(fn: (client: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
