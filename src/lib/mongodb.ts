import "server-only";

import { MongoClient } from "mongodb";

// Shared by concurrent requests and dev hot reloads within one Node.js instance.
// Separate Vercel instances each have their own client and connection pool.
const cache = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

export function getMongoClient(): Promise<MongoClient> {
  if (cache.mongoClientPromise) return cache.mongoClientPromise;

  // Read lazily: building the app must not require a database or credentials.
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 5_000,
    waitQueueTimeoutMS: 5_000,
    socketTimeoutMS: 10_000,
  });

  const promise = client.connect().catch(async (error: unknown) => {
    // A failed initial connection must not poison later requests.
    if (cache.mongoClientPromise === promise) {
      cache.mongoClientPromise = undefined;
    }
    await client.close().catch(() => undefined);
    throw error;
  });
  cache.mongoClientPromise = promise;
  return promise;
}
