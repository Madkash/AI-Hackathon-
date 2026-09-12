import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE || "compliance_agent";

let clientPromise;

export function hasMongoConfiguration() {
  return Boolean(uri);
}

export function getMongoClient() {
  if (!uri) return null;

  if (!clientPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 1200,
      connectTimeoutMS: 1200,
    });
    clientPromise = client.connect().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }

  return clientPromise;
}

export async function getDatabase() {
  const client = await getMongoClient();
  return client ? client.db(databaseName) : null;
}
