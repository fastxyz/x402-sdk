// Extract and examine the certificate from the last payment
const payloadBase64 = "eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoiZXhhY3QiLCJuZXR3b3JrIjoiZmFzdC1tYWlubmV0IiwicGF5bG9hZCI6eyJ0eXBlIjoic2lnbkFuZFNlbmRUcmFuc2FjdGlvbiIsInRyYW5zYWN0aW9uQ2VydGlmaWNhdGUiOnsiZW52ZWxvcGUiOnsidHJhbnNhY3Rpb24iOnsiUmVsZWFzZTIwMjYwMzE5Ijp7Im5ldHdvcmtfaWQiOiJmYXN0Om1haW5uZXQiLCJzZW5kZXIiOlsxMzcsyNTIsyNTQsMTQwLDIwMyw";

const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
console.log('Payload structure:', JSON.stringify(payload, null, 2).slice(0, 2000));
console.log('...');
console.log('\nTransaction keys:', Object.keys(payload.payload.transactionCertificate.envelope.transaction));
