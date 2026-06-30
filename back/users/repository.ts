import { MongoClient, Db, Collection } from 'mongodb';
import type { User, RankBucket } from './model';
import { env, gameConfig } from '../config';

const dbName = 'main'
const userCollectionName = 'users'
const rankBucketsCollectionName = 'rank_buckets'

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
let rankBucketsCollection: Collection<RankBucket> | null = null;

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
      rankBucketsCollection = db.collection<RankBucket>(rankBucketsCollectionName);
      return client;
    })();
    await clientReadyPromise;
    return { error: null };
  } catch (error) {
    client = null;
    db = null;
    usersCollection = null;
    rankBucketsCollection = null;
    clientReadyPromise = null;
    return { error };
  }
}

// cache for leaderboard
let cachedLeaderboard: LeaderboardUser[] | null = null;
let cacheTimestamp: number = 0;

// since methods are only used in usersRepository,
// we don't attempt to connectToDatabase in each method unlike in usersRepository
const rankBucketsRepository = {
  getBucketIndex(clicks: number): number {
    return Math.floor(clicks / gameConfig.bucketRange);
  },

  async getAllBucketsDescending(): Promise<{
    buckets: RankBucket[];
    error: null;
    originalError: null;
  } | {
    buckets: null;
    error: RepositoryError;
    originalError: any;
  }> {
    if (!rankBucketsCollection) {
      return {
        buckets: null,
        error: 'connection_problem',
        originalError: 'rankBucketsCollection is falsy, must be a bug'
      };
    }

    try {
      const buckets = await rankBucketsCollection
        .find({})
        .sort({ _id: -1 })
        .toArray();

      return {
        buckets,
        error: null,
        originalError: null
      };
    } catch (error) {
      return {
        buckets: null,
        error: 'database_error',
        originalError: error
      };
    }
  },

  async getBucket(bucketIndex: number): Promise<{
    bucket: RankBucket | null;
    error: null;
    originalError: null;
  } | {
    bucket: null;
    error: RepositoryError;
    originalError: any;
  }> {
    if (!rankBucketsCollection) {
      return {
        bucket: null,
        error: 'connection_problem',
        originalError: 'rankBucketsCollection is falsy, must be a bug'
      };
    }

    try {
      const bucket = await rankBucketsCollection.findOne({ _id: bucketIndex });

      return {
        bucket,
        error: null,
        originalError: null
      };
    } catch (error) {
      return {
        bucket: null,
        error: 'database_error',
        originalError: error
      };
    }
  },

  async updateBucketCount(oldClicks: number, newClicks: number): Promise<{
    success: true;
    error: null;
    originalError: null;
  } | {
    success: false;
    error: RepositoryError;
    originalError: any;
  }> {
    const oldBucketIndex = this.getBucketIndex(oldClicks);
    const newBucketIndex = this.getBucketIndex(newClicks);
    const successResult = {
      success: true,
      error: null,
      originalError: null
    };
    if (oldBucketIndex === newBucketIndex) {
      return successResult;
    }

    if (!rankBucketsCollection || !client) {
      return {
        success: false,
        error: 'connection_problem',
        originalError: 'rankBucketsCollection or client is falsy, must be a bug'
      };
    }

    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        // Decrement old bucket count
        await rankBucketsCollection.updateOne(
          { _id: oldBucketIndex },
          { $inc: { count: -1 } },
          { session }
        );
        // Increment new bucket count
        await rankBucketsCollection.updateOne(
          { _id: newBucketIndex },
          { $inc: { count: 1 } },
          { session, upsert: true }
        );
      });

      return successResult;
    } catch (error) {
      return {
        success: false,
        error: 'database_error',
        originalError: error
      };
    } finally {
      await session.endSession();
    }
  },

  async incrementBucketCount(clicks: number): Promise<{
    success: true;
    error: null;
    originalError: null;
  } | {
    success: false;
    error: RepositoryError;
    originalError: any;
  }> {
    if (!rankBucketsCollection) {
      return {
        success: false,
        error: 'connection_problem',
        originalError: 'rankBucketsCollection is falsy, must be a bug'
      };
    }

    try {
      const bucketIndex = this.getBucketIndex(clicks);
      await rankBucketsCollection.updateOne(
        { _id: bucketIndex },
        { $inc: { count: 1 } },
        { upsert: true }
      );

      return {
        success: true,
        error: null,
        originalError: null
      };
    } catch (error) {
      return {
        success: false,
        error: 'database_error',
        originalError: error
      };
    }
  }
};

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

      // not transactional: seems fine since buckets are a heuristic anyway
      // also no handling of ↓ bucketResult.error for that reason
      await rankBucketsRepository.incrementBucketCount(0);

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
              prevNumberOfClicks: '$numberOfClicks',
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

      if (result) {
        const oldClicks = (result as any).prevNumberOfClicks as number;
        const newClicks = result.numberOfClicks;
        // not transactional: seems fine since buckets are a heuristic anyway
        // also no handling of ↓ bucketResult.error for that reason
        await rankBucketsRepository.updateBucketCount(oldClicks, newClicks);
      }

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

      const userBucketIndex = rankBucketsRepository.getBucketIndex(user.numberOfClicks);

      // Check if user is among top-leaderboardSize*2 by checking buckets from highest _id
      const bucketsResult = await rankBucketsRepository.getAllBucketsDescending();
      if (bucketsResult.error) {
        return {
          rank: null,
          error: bucketsResult.error,
          originalError: bucketsResult.originalError
        };
      }
      const buckets = bucketsResult.buckets;

      let accumulatedCount = 0;
      let lowBucketIndex: number | null = null;
      for (const bucket of buckets) {
        accumulatedCount += bucket.count;
        if (accumulatedCount >= gameConfig.leaderboardSize * 2) {
          lowBucketIndex = bucket._id;
          break;
        }
      }

      // If user is in top bucket range, calculate rank as usual
      if (lowBucketIndex !== null && user.numberOfClicks >= lowBucketIndex * gameConfig.bucketRange) {
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
      }

      // Otherwise, use bucket approximation
      // Calculate total count of buckets with higher _id
      let totalCountHigherBuckets = 0;
      for (const bucket of buckets) {
        if (bucket._id > userBucketIndex) {
          totalCountHigherBuckets += bucket.count;
        }
      }

      // Get user's bucket count
      const userBucketResult = await rankBucketsRepository.getBucket(userBucketIndex);
      if (userBucketResult.error) {
        return {
          rank: null,
          error: userBucketResult.error,
          originalError: userBucketResult.originalError
        };
      }

      // "|| 0" is an ok workaround if the bucket is missing
      const userBucketCount = userBucketResult.bucket?.count || 0;

      // Linear approximation within the bucket
      const clicksIntoBucket = user.numberOfClicks - userBucketIndex * gameConfig.bucketRange;
      const percentageIntoBucket = clicksIntoBucket / gameConfig.bucketRange;
      const approximateRank = totalCountHigherBuckets + Math.floor(percentageIntoBucket * userBucketCount) + 1;

      return {
        rank: approximateRank,
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

  // uses cache
  async _getLeaderboard(): Promise<GetLeaderboardResult> {
    const now = Date.now();

    if (cachedLeaderboard && (now - cacheTimestamp) < env.leaderboardCacheTtlMs) {
      return {
        leaderboard: cachedLeaderboard,
        error: null
      };
    }

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

      cachedLeaderboard = leaderboardWithRanks;
      cacheTimestamp = now;

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
  },

  async getLeaderboardWithUser(tgId: number): Promise<GetLeaderboardResult> {
    const leaderboardResult = await this._getLeaderboard();
    if (leaderboardResult.error) {
      return leaderboardResult;
    }

    const leaderboardWithRanks = leaderboardResult.leaderboard;
    const isUserInLeaderboard = leaderboardWithRanks.some(u => u.tgId === tgId);

    if (!isUserInLeaderboard) {
      const rankResult = await this.getRankAndUser(tgId);
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
  }
};

export async function ensureCollections(): Promise<{ error: null | unknown }> {
  try {
    const { error: connectionError } = await connectToDatabase();
    if (connectionError) {
      throw connectionError;
    }
    if (!db) {
      throw new Error('db is falsy, must be a bug');
    }

    const existingCollections = await db.listCollections().toArray();
    const existingCollectionNames = existingCollections.map(c => c.name);

    if (!existingCollectionNames.includes(userCollectionName)) {
      await db.createCollection(userCollectionName);
    }
    if (!existingCollectionNames.includes(rankBucketsCollectionName)) {
      await db.createCollection(rankBucketsCollectionName);
    }

    return { error: null };
  } catch (error: unknown) {
    return { error };
  }
}

// presumably not idempotent
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
    rankBucketsCollection = null;
  }
}
