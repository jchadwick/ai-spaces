import { listShares as getShares } from '../share-store.js';

export async function listShares(spaceId: string) {
  const shares = getShares(spaceId);
  
  if (shares.length === 0) {
    console.log(`No shares for space ${spaceId}\n`);
    return;
  }
  
  console.log(`Shares for space ${spaceId}:\n`);
  console.log('  ' + 'ID'.padEnd(16) + '  ' + 'Role'.padEnd(8) + '  ' + 'Created'.padEnd(20) + '  Expires');
  console.log('  ' + '-'.repeat(60));
  
  for (const share of shares) {
    const expires = share.expires ? new Date(share.expires).toLocaleDateString() : 'Never';
    console.log('  ' + share.id.padEnd(16) + '  ' + share.role.padEnd(8) + '  ' + new Date(share.created).toLocaleDateString().padEnd(20) + '  ' + expires);
  }
  
  console.log(`\nTotal: ${shares.length} share(s)\n`);
}