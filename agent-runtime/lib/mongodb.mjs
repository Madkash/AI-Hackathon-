import { MongoClient } from "mongodb";

let clientPromise;

export async function closeDatabase() {
  if (!clientPromise) return;
  const client = await clientPromise.catch(() => null);
  if (client) await client.close();
  clientPromise = undefined;
}

export async function getDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!clientPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
    });
    clientPromise = client.connect().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DATABASE || "compliance_agent");
}

export async function persistEvidence(record) {
  const database = await getDatabase();
  if (!database) return false;
  await database.collection("evidence_documents").updateOne(
    { evidence_id: record.evidence_id },
    { $set: record },
    { upsert: true },
  );
  return true;
}

export async function persistAssessment(assessment) {
  const database = await getDatabase();
  if (!database) return false;
  const targetKey = `${assessment.target.name}:${assessment.target.version ?? "unknown"}`;
  await database.collection("targets").updateOne(
    { target_key: targetKey },
    {
      $set: {
        target_key: targetKey,
        ...assessment.target,
        last_assessed_at: assessment.generated_at,
      },
      $setOnInsert: { created_at: assessment.generated_at },
    },
    { upsert: true },
  );
  await database.collection("assessment_runs").insertOne(assessment);
  if (assessment.results?.length) {
    await database.collection("test_results").insertMany(
      assessment.results.map((result) => ({
        run_id: assessment.run_id,
        target_key: targetKey,
        generated_at: assessment.generated_at,
        suite: result.suite,
        test_id: result.id,
        ...result,
      })),
    );
  }
  return true;
}
