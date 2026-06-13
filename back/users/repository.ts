import { MongoClient, Db, Collection } from 'mongodb';
import type { User } from './model';
import { env, gameConfig } from '../config';

const dbName = 'main'
const userCollectionName = 'users'

const sorterWithTieBreaker = { numberOfClicks: -1, _id: 1 } as const;


type RepositoryError =
  | 'connection_problem'
  | 'database_error'
  | 'constraint_issue';

type UserResultError = {
  user: null;
  error: RepositoryError;
  originalError: any;
};

type UserResultSuccess = {
  user: User | null;
  error: null;
}

type FindUserResult = UserResultSuccess | UserResultError;

type CreateUserResult = {
  user: User;
  error: null;
} | UserResultError;

type AddLegitimateClicksResult = UserResultSuccess | {
  user: null;
  error: RepositoryError | 'invalid_clicks_count';
  originalError: any;
};

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

type LeaderboardUser = User & { rank: number };

type GetLeaderboardResult = {
  leaderboard: LeaderboardUser[];
  error: null;
} | {
  leaderboard: null;
  error: RepositoryError;
  originalError: any;
};


let client: MongoClient | null = null;
// tracking promise to avoid race on cold start
let clientReadyPromise: Promise<MongoClient> | null = null;
let db: Db | null = null;
let usersCollection: Collection<User> | null = null;

async function connectToDatabase(): Promise<{ error: any }> {
  if (client) return { error: null };
  if (clientReadyPromise) {
    await clientReadyPromise;
    if (client) return { error: null };
  }

  try {
    clientReadyPromise = (async () => {
      client = new MongoClient(env.MONGODB_CONNECT_URL, {
      });
      await client.connect();
      db = client.db(dbName);
      usersCollection = db.collection<User>(userCollectionName);
      return client;
    })();
    await clientReadyPromise;
    return { error: null };
  } catch (error) {
    client = null;
    db = null;
    usersCollection = null;
    clientReadyPromise = null;
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
        lastClickEnergy: gameConfig.maxEnergy,
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
    if (claimedClicksCount < 0
        || claimedClicksCount > gameConfig.maxEnergy /
          gameConfig.clickEnergyCost * gameConfig.excessiveClicksTolerance
        || claimedClicksCount % 1 != 0
    ) {
      return {
        user: null,
        error: 'invalid_clicks_count',
        originalError: 'claimedClicksCount must be between 0 and maxEnergy'
      };
    }

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
                          gameConfig.energyRegenPerMinute
                        ]
                      }
                    ]
                  },
                  gameConfig.maxEnergy
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
                      $divide: ['$currentEnergy', gameConfig.clickEnergyCost]
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
                  { $multiply: ['$legitimateClicks', gameConfig.clickEnergyCost] }
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
  async getRankAndUser(tgId: number): Promise<GetRankResult> {
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
      const user = await usersCollection.findOne({ tgId });
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
  },

  async getLeaderboard(tgId: number): Promise<GetLeaderboardResult> {
    const { error: connectionError } = await connectToDatabase();
    if (connectionError) {
      return {
        leaderboard: null,
        error: 'connection_problem',
        originalError: connectionError
      };
    }
    if (!usersCollection) {
      return {
        leaderboard: null,
        error: 'connection_problem',
        originalError: 'usersCollection is falsy, must be a bug'
      };
    }

    try {
      const leaderboard = await usersCollection
        .find()
        .sort(sorterWithTieBreaker)
        .limit(gameConfig.leaderboardSize)
        .toArray();

      const leaderboardWithRanks: LeaderboardUser[] = leaderboard.map((user, index) => ({
        ...user,
        rank: index + 1
      }));

      const isUserInLeaderboard = leaderboard.some(u => u.tgId === tgId);

      if (!isUserInLeaderboard) {
        const rankResult = await this.getRank(tgId);
        if (rankResult.error) {
          return {
            leaderboard: null,
            error: rankResult.error,
            originalError: rankResult.originalError
          };
        }
        if (rankResult.rank === null) {
          return {
            leaderboard: null,
            error: 'constraint_issue',
            originalError: 'user not found, must be a bug'
          };
        }
        leaderboardWithRanks.push({
          ...rankResult.user,
          rank: rankResult.rank
        });
      }

      return {
        leaderboard: leaderboardWithRanks,
        error: null
      };
    } catch (error) {
      return {
        leaderboard: null,
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
