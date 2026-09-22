function normalizeAppearance(value = {}) {
  const result = {};
  if (typeof value.displayName === 'string' && value.displayName.trim()) result.displayName = value.displayName.trim().slice(0, 500);
  for (const key of ['offsetX', 'offsetY']) if (Number.isFinite(value[key])) result[key] = Math.max(-10000, Math.min(10000, value[key]));
  if (typeof value.fontFamily === 'string') result.fontFamily = value.fontFamily.slice(0, 500);
  for (const key of ['textColor', 'backgroundColor']) if (/^#[0-9a-f]{6}$/i.test(value[key])) result[key] = value[key];
  if (Number.isFinite(value.fontSize)) result.fontSize = Math.max(8, Math.min(96, value.fontSize));
  if (Number.isFinite(value.backgroundAlpha)) result.backgroundAlpha = Math.max(0, Math.min(1, value.backgroundAlpha));
  if (['nw','n','ne','w','c','e','sw','s','se'].includes(value.anchor)) result.anchor = value.anchor;
  result.outside = value.outside === true && value.anchor !== 'c';
  result.leftAlign = value.leftAlign === true;
  if (typeof value.iconImage === 'string' && /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(value.iconImage) && value.iconImage.length <= 12 * 1024 * 1024) result.iconImage = value.iconImage;
  return result;
}
module.exports = { normalizeAppearance };
