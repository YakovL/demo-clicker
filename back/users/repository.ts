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

const sorterWithTieBreaker = { numberOfClicks: -1, _id: 1 };


type RepositoryError = 
  | 'connection_problem'
  | 'database_error';

type UserResultError = {
  user: null;
  error: RepositoryError;
  originalError: any;
};

type FindUserResult = {
  user: User | null;
  error: null;
} | UserResultError;

type CreateUserResult = {
  user: User;
  error: null;
} | UserResultError;

type AddLegitimateClicksResult = FindUserResult;

type GetRankResult = ({
  rank: number;
  user: User;
} | {
  rank: null;
  user: null;
}) & {
  error: null;
} | {
  rank: null;
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
  async findById(tgId: number): Promise<FindUserResult> {
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

  async create(tgId: number, title: string): Promise<CreateUserResult> {
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
        title,
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
  },

  async addLegitimateClicks(tgId: number, claimedClicksCount: number): Promise<AddLegitimateClicksResult> {
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
      const serverNow = new Date();

      const result = await usersCollection.findOneAndUpdate(
        { tgId },
        [
          // currentEnergy = min(lastClickEnergy + (serverNow - lastClickAt) * energyRegenPerMinute, maxEnergy)
          {
            $set: {
              currentEnergy: {
                $min: [
                  {
                    $add: [
                      '$lastClickEnergy',
                      {
                        $multiply: [
                          {
                            $divide: [
                              { $subtract: [serverNow, '$lastClickTimestamp'] },
                              60000
                            ]
                          },
                          config.energyRegenPerMinute
                        ]
                      }
                    ]
                  },
                  config.maxEnergy
                ]
              }
            }
          },
          // ligitimateClicks = min(currentEnergy / clickEnergyCost, claimedClicksCount)
          {
            $set: {
              legitimateClicks: {
                $min: [
                  {
                    $floor: {
                      $divide: ['$currentEnergy', config.clickEnergyCost]
                    }
                  },
                  claimedClicksCount
                ]
              }
            }
          },
          // newEnergy = currentEnergy - ligitimateClicks * clickEnergyCost
          // also update clicks number and timestamp
          {
            $set: {
              numberOfClicks: {
                $add: ['$numberOfClicks', '$legitimateClicks']
              },
              lastClickTimestamp: serverNow,
              lastClickEnergy: {
                $subtract: [
                  '$currentEnergy',
                  { $multiply: ['$legitimateClicks', config.clickEnergyCost] }
                ]
              }
            }
          },
          // cleanup temp fields
          {
            $project: {
              currentEnergy: 0,
              legitimateClicks: 0
            }
          }
        ],
        { returnDocument: 'after' }
      );

      return {
        user: result || null,
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

  // currently using _id as a tie-breaker
  async getRank(tgId: number): Promise<GetRankResult> {
    const { error: connectionError } = await connectToDatabase();
    if (connectionError) {
      return {
        rank: null,
        error: 'connection_problem',
        originalError: connectionError
      };
    }
    if (!usersCollection) {
      return {
        rank: null,
        error: 'connection_problem',
        originalError: 'usersCollection is falsy, must be a bug'
      };
    }

    try {
      const user = await usersCollection.findOne({ tgId }, { projection: { numberOfClicks: 1, _id: 1 } });
      if (!user) {
        return {
          rank: null,
          user: null,
          error: null
        };
      }

      // not using sorterWithTieBreaker directly for better performance
      const count = await usersCollection.countDocuments({
        $or: [
          { numberOfClicks: { $gt: user.numberOfClicks } },
          {
            numberOfClicks: user.numberOfClicks,
            _id: { $lt: user._id }
          }
        ]
      });
      const rank = count + 1;

      return {
        rank,
        user,
        error: null
      };
    } catch (error) {
      return {
        rank: null,
        error: 'database_error',
        originalError: error
      };
    }
  }
};

export async function ensureIndexes(): Promise<{ error: null | unknown }> {
  try {
    const { error: connectionError } = await connectToDatabase();
    if (connectionError) {
      throw connectionError;
    }
    if (!usersCollection) {
      throw new Error('usersCollection is falsy, must be a bug');
    }

    await usersCollection.createIndex({ tgId: 1 }, { unique: true });
    await usersCollection.createIndex(sorterWithTieBreaker);
    return { error: null };
  } catch (error: unknown) {
    return { error };
  }
}

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    usersCollection = null;
  }
}
