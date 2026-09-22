const Utils = {
  formatBytes(bytes) {
    if (bytes == null) return '--';
    if (bytes === 0) return 'Zero bytes';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  },

  formatDate(ms) {
    if (!ms) return '--';
    const d = new Date(ms);
    return (
      d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
  },

  uid(prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  },
};
