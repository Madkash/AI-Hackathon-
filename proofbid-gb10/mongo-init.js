const proofbid = db.getSiblingDB('proofbid');
proofbid.createUser({user: 'proofbid', pwd: process.env.PROOFBID_DB_PASSWORD,
  roles: [{role: 'readWrite', db: 'proofbid'}]});
