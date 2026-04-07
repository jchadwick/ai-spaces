import { revokeShare as revokeShareRecord } from '../share-store.js';

export async function revokeShare(spaceId: string, shareId: string) {
  const success = revokeShareRecord(spaceId, shareId);
  
  if (!success) {
    console.error(`Share ${shareId} not found or already revoked`);
    process.exit(1);
  }
  
  console.log(`Share ${shareId} revoked\n`);
}