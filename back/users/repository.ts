import { MongoClient, Db, Collection } from 'mongodb';
import dotenv from 'dotenv';
import type { User } from './model';
import { config } from './model';

dotenv.config();

const MONGODB_CONNECT_URL = process.env.MONGODB_CONNECT_URL;
if (!MONGODB_CONNECT_URL) {
  throw new Error('MONGODB_CONNECT_URL environment variable is not set');
}
const mongoConnectUrl: string = MONGODB_CONNECT_URL;

const dbName = 'main'
const userCollectionName = 'users'


type RepositoryError = 
  | 'connection_problem'
  | 'database_error';

type FindUserResultSuccess = {
  user: User | null;
  error: null;
};

type FindUserResultError = {
  user: null;
  error: RepositoryError;
  originalError: any;
};

type FindUserResult = FindUserResultSuccess | FindUserResultError;

type CreateUserResult = {
  user: User;
  error: null;
} | {
  user: null;
  error: RepositoryError;
  originalError: any;
};


let client: MongoClient | null = null;
let db: Db | null = null;
let usersCollection: Collection<User> | null = null;

async function connectToDatabase(): Promise<{ error: any }> {
  if (client) return { error: null };

  try {
    client = new MongoClient(mongoConnectUrl, {
    });
    await client.connect();
    db = client.db(dbName);
    usersCollection = db.collection<User>(userCollectionName);
    return { error: null };
  } catch (error) {
    client = null;
    db = null;
    usersCollection = null;
    return { error };
  }
}

export const usersRepository = {
  async findUser(tgId: number): Promise<FindUserResult> {
    const { error: connectionError } = await connectToDatabase();
    if (connectionError) {
      return {
        user: null,
        error: 'connection_problem',
        originalError: connectionError
      };
    }
    if (!usersCollection) {
      return {
        user: null,
        error: 'connection_problem',
        originalError: 'usersCollection is falsy, must be a bug'
      };
    }

    try {
      const user = await usersCollection.findOne({ tgId });

      return {
        user: user || null,
        error: null
      };
    } catch (error) {
      return {
        user: null,
        error: 'database_error',
        originalError: error
      };
    }
  },

  async createUser(tgId: number): Promise<CreateUserResult> {
    const { error: connectionError } = await connectToDatabase();
    if (connectionError) {
      return {
        user: null,
        error: 'connection_problem',
        originalError: connectionError
      };
    }
    if (!usersCollection) {
      return {
        user: null,
        error: 'connection_problem',
        originalError: 'usersCollection is falsy, must be a bug'
      };
    }

    try {
      const newUser: User = {
        tgId,
        numberOfClicks: 0,
        lastClickEnergy: config.maxEnergy,
        lastClickTimestamp: new Date()
      };

      await usersCollection.insertOne(newUser);

      return {
        user: newUser,
        error: null
      };
    } catch (error) {
      return {
        user: null,
        error: 'database_error',
        originalError: error
      };
    }
  }
};

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    usersCollection = null;
  }
}
