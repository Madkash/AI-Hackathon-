import os
from pymongo import MongoClient

client = MongoClient(os.environ['PROOFBID_MONGO_URI'], serverSelectionTimeoutMS=5000,
                     connectTimeoutMS=5000, socketTimeoutMS=10000)
db = client.proofbid

def initialize():
    client.admin.command('ping')
    db.jobs.create_index([('state', 1), ('created', 1)])
    db.results.create_index('created')

def public(document):
    if document is None:
        return None
    result = dict(document)
    result.pop('_id', None)
    result.pop('input', None)
    return result
