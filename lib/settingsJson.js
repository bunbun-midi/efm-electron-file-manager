function validateSettings(value, defaults) {
  const settings = value?.format === 'efm-settings' ? value.settings : value;
  if (value?.format && (value.format !== 'efm-settings' || value.version !== 1)) throw new Error('Unsupported settings format/version.');
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Expected a JSON settings object.');
  const result = {};
  for (const [key, item] of Object.entries(settings)) {
    if (key === 'windowAppearance') {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid window appearance settings.');
      result[key] = {};
      for (const [name, v] of Object.entries(item)) {
        if (!/^[a-z-]+$/.test(name) || !(typeof v === 'number' && Number.isFinite(v) || typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v))) throw new Error(`Invalid window appearance value: ${name}`);
        result[key][name] = v;
      }
      continue;
    }
    if (!Object.hasOwn(defaults, key)) continue;
    if (key === 'desktopImage') {
      if (item !== null && (typeof item !== 'string' || item.length > 32768)) throw new Error('Invalid desktop image path.');
    } else if (typeof item !== typeof defaults[key] || typeof item === 'number' && !Number.isFinite(item)) throw new Error(`Invalid setting: ${key}`);
    if (typeof item === 'string' && (item.length > 32768 || /[\0\r\n]/.test(item))) throw new Error(`Invalid setting: ${key}`);
    if (key.endsWith('Color') && !/^#[0-9a-f]{6}$/i.test(item)) throw new Error(`Invalid color: ${key}`);
    result[key] = item;
  }
  for (const [key, min, max] of [['iconSize',16,3840], ['fontSize',9,20], ['labelBackgroundAlpha',0,1]]) {
    if (Object.hasOwn(result,key) && (result[key] < min || result[key] > max)) throw new Error(`${key} must be between ${min} and ${max}.`);
  }
  if (!Object.keys(result).length) throw new Error('No recognized settings found in this JSON file.');
  return result;
}
module.exports = { validateSettings };
