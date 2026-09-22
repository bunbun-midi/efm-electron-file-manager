// Listing is injected so real and virtual directories share matching/traversal
// semantics. Real listings don't classify symlinks as directories, avoiding loops.
async function searchDirectory({ root, query, recursive = false, signal, maxResults = 10000, maxDirectories = 10000, onProgress }, list) {
  const needle = query.trim().toLowerCase();
  if (!needle) throw new Error('Enter part of a filename to search for.');
  const queue = [root];
  const visited = new Set();
  const entries = [];
  let skipped = 0;
  let truncated = false;
  let lastProgress=0;
  for (let index = 0; index < queue.length; index++) {
    signal?.throwIfAborted();
    const current = queue[index];
    if (visited.has(current)) continue;
    if (visited.size >= maxDirectories) { truncated = true; break; }
    visited.add(current);
    let listing;
    try { listing = await list(current); }
    catch (error) {
      if (index === 0) throw error;
      skipped++; continue;
    }
    signal?.throwIfAborted();
    for (const entry of listing.entries) {
      if (entry.name.toLowerCase().includes(needle)) {
        if (entries.length >= maxResults) { truncated = true; break; }
        entries.push({ ...entry, parentDirectory: listing.path });
      }
      if (recursive && entry.kind === 'directory' && !visited.has(entry.path)) {
        if (queue.length < maxDirectories) queue.push(entry.path);
        else truncated = true;
      }
    }
    if (onProgress && Date.now()-lastProgress>=150) { lastProgress=Date.now();onProgress({entries:[...entries],skipped,truncated,scanned:visited.size,pending:queue.length-index-1}); }
    if (entries.length >= maxResults && truncated) break;
  }
  return { entries, skipped, truncated };
}
module.exports = { searchDirectory };
