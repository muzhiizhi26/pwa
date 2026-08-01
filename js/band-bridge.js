// ── Web Bluetooth 手环连接与心率读取 ──
// 纯前端方案，无需服务器，支持桌面 Chrome / Android Chrome

const BAND_STORE_KEY = 'band_device_cache';

// ── 状态 ──
let _bandDevice = null;       // BluetoothDevice
let _bandServer = null;       // GATT Server
let _heartRateChar = null;   // Heart Rate Measurement characteristic
let _isConnected = false;
let _heartRateHistory = [];  // 最近心率数据 [{ts, value}]
let _onHeartRateCallback = null;
let _discoveredServices = []; // 设备服务列表（调试用）

// ── 对外状态 ──
const bandStatus = {
  connected: false,
  deviceName: '',
  heartRate: null,       // 当前心率 (bpm)
  heartRateHistory: [],  // 最近20条
  lastUpdate: null,      // 最后更新时间
};

// ── 检查浏览器是否支持 Web Bluetooth ──
function isWebBluetoothSupported() {
  return 'bluetooth' in navigator;
}

// ── 已知 BLE 服务 UUID 名称映射 ──
const KNOWN_SERVICES = {
  '00001800-0000-1000-8000-00805f9b34fb': 'Generic Access',
  '00001801-0000-1000-8000-00805f9b34fb': 'Generic Attribute',
  '0000180a-0000-1000-8000-00805f9b34fb': 'Device Information',
  '0000180d-0000-1000-8000-00805f9b34fb': 'Heart Rate',
  '0000180f-0000-1000-8000-00805f9b34fb': 'Battery Service',
  '00001810-0000-1000-8000-00805f9b34fb': 'Blood Pressure',
  '00001811-0000-1000-8000-00805f9b34fb': 'Alert Notification',
  '00001812-0000-1000-8000-00805f9b34fb': 'Human Interface Device',
  '00001813-0000-1000-8000-00805f9b34fb': 'Scan Parameters',
  '00001814-0000-1000-8000-00805f9b34fb': 'Running Speed and Cadence',
  '00001816-0000-1000-8000-00805f9b34fb': 'Cycling Speed and Cadence',
  '0000181a-0000-1000-8000-00805f9b34fb': 'Environmental Sensing',
  '0000181c-0000-1000-8000-00805f9b34fb': 'User Data',
  '0000fee0-0000-1000-8000-00805f9b34fb': 'Vendor Specific (小米/华米)',
  '0000fee1-0000-1000-8000-00805f9b34fb': 'Vendor Specific (小米/华米)',
  '0000fee7-0000-1000-8000-00805f9b34fb': 'Vendor Specific (小米手环)',
};

// ── 扫描并连接手环 ──
// mode: 'auto' = 先标准过滤, 不行再全部; 'all' = 直接全部设备
async function connectBand(mode) {
  if (!isWebBluetoothSupported()) {
    throw new Error('当前浏览器不支持 Web Bluetooth，请使用 Chrome/Edge/Android Chrome');
  }

  // 断开已有连接
  await disconnectBand();

  try {
    let device = null;
    
    if (mode === 'all') {
      // 模式2: 显示所有蓝牙设备（手环不广播心率服务时用）
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['heart_rate', 0x180D, 'device_information', 0x180A]
      });
    } else {
      // 模式1: 只显示有心率服务的 BLE 设备（推荐，列表更干净）
      try {
        device = await navigator.bluetooth.requestDevice({
          filters: [{ services: ['heart_rate'] }],
          optionalServices: ['device_information', 0x180A]
        });
      } catch (firstErr) {
        // 如果用户点了取消，或者找不到设备，抛错
        if (firstErr.name === 'NotFoundError') {
          throw new Error('未找到支持心率服务的蓝牙设备。手环可能不广播标准心率服务，点「重新连接」试试第二种扫描模式。');
        }
        throw firstErr;
      }
    }

    if (!device) throw new Error('未选择设备');

    _bandDevice = device;
    cacheDeviceInfo(_bandDevice.name || '未知手环', _bandDevice.id);

    // 连上 GATT 后再补充声明需要的心率服务（acceptAllDevices 时需要）
    if (!_bandServer) {
      _bandServer = await _bandDevice.gatt.connect();
    }

    // 尝试获取心率服务
    let service = null;
    let hrFound = false;

    // 先尝试标准 heart_rate 服务名和 UUID
    for (const hrId of ['heart_rate', 0x180D]) {
      try {
        service = await _bandServer.getPrimaryService(hrId);
        hrFound = true;
        break;
      } catch {}
    }

    if (!hrFound) {
      // 标准心率服务不存在 → 枚举所有服务，看这个手环到底有什么
      let serviceList = [];
      try {
        const allServices = await _bandServer.getPrimaryServices();
        serviceList = allServices.map(s => ({
          uuid: s.uuid,
          name: KNOWN_SERVICES[s.uuid.toLowerCase()] || s.uuid
        }));
        console.log('[BandBridge] 设备可用服务列表:', serviceList);
      } catch (enumErr) {
        console.warn('[BandBridge] 无法读取设备服务列表:', enumErr.message);
      }
      _discoveredServices = serviceList;

      // 断开连接
      await disconnectBand();

      if (serviceList.length > 0) {
        const err = new Error('该手环没有标准心率服务(0x180D)');
        err.discoveredServices = serviceList;
        err.deviceName = _bandDevice.name || '未知手环';
        throw err;
      } else {
        throw new Error('已连接但无法读取设备服务。原因：手环被系统蓝牙占用(先在Windows设置移除再试)，或手环使用私有蓝牙协议不兼容');
      }
    }

    // 获取心率测量特征值 (0x2A37)
    _heartRateChar = await service.getCharacteristic('heart_rate_measurement');

    // 订阅心率通知
    await _heartRateChar.startNotifications();
    _heartRateChar.addEventListener('characteristicvaluechanged', onHeartRateChanged);

    _isConnected = true;
    bandStatus.connected = true;
    bandStatus.deviceName = _bandDevice.name || '未知手环';
    bandStatus.lastUpdate = Date.now();

    // 连接成功 → 桌面通知
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⌚ 手环已连接', {
          body: bandStatus.deviceName + ' 蓝牙连接成功',
          icon: '/emotions/calm.webp',
          tag: 'band-connected'
        });
      }
    } catch (e) {}

    _bandDevice.addEventListener('gattserverdisconnected', onBandDisconnected);

    tryReadDeviceInfo(service);

    return { success: true, name: bandStatus.deviceName };
  } catch (err) {
    await cleanupAfterError();
    throw err;
  }
}

// ── 断开连接 ──
async function disconnectBand() {
  try {
    if (_heartRateChar) {
      _heartRateChar.removeEventListener('characteristicvaluechanged', onHeartRateChanged);
      try { await _heartRateChar.stopNotifications(); } catch {}
      _heartRateChar = null;
    }
    if (_bandServer && _bandServer.connected) {
      _bandServer.disconnect();
    }
    if (_bandDevice) {
      _bandDevice.removeEventListener('gattserverdisconnected', onBandDisconnected);
    }
  } catch {}
  
  _bandServer = null;
  _bandDevice = null;
  _isConnected = false;
  bandStatus.connected = false;
  bandStatus.deviceName = '';
  bandStatus.heartRate = null;
}

// ── 尝试重连上次设备 ──
async function reconnectLastDevice() {
  const cached = getCachedDeviceInfo();
  if (!cached) {
    throw new Error('没有之前连接过的设备记录，请先手动连接');
  }

  try {
    // 通过缓存 id 重新获取设备（需要用户再次选择，Web Bluetooth 安全限制）
    // 实际上 Web Bluetooth 不允许通过 id 静默重连，所以只能提示用户重新选择
    console.log('[BandBridge] 上次连接的设备:', cached.name);
    return await connectBand();
  } catch (err) {
    throw new Error('重连失败，请重新扫描连接: ' + err.message);
  }
}

// ── 设置心率回调 ──
function onHeartRate(callback) {
  _onHeartRateCallback = callback;
}

// ── 获取当前心率数据摘要 ──
function getHeartRateSummary() {
  const history = bandStatus.heartRateHistory;
  if (history.length === 0) return null;

  const values = history.map(h => h.value);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    current: bandStatus.heartRate,
    avg,
    min,
    max,
    samples: history.length,
    lastUpdate: bandStatus.lastUpdate
  };
}

// ── 清除历史数据 ──
function clearHeartRateHistory() {
  _heartRateHistory = [];
  bandStatus.heartRateHistory = [];
}

// ── 获取状态文本（用于 UI 显示） ──
function getStatusText() {
  if (!isWebBluetoothSupported()) return '❌ 浏览器不支持蓝牙';
  if (bandStatus.connected) {
    const hr = bandStatus.heartRate ? `❤️ ${bandStatus.heartRate} bpm` : '⏳ 等待数据...';
    return `✅ 已连接 ${bandStatus.deviceName} | ${hr}`;
  }
  return '⚪ 未连接';
}

// ═══════════════════════
// 内部函数
// ═══════════════════════

function onHeartRateChanged(event) {
  const value = event.target.value;
  // 解析心率数据 (Bluetooth Heart Rate Measurement)
  // 格式: flags(1 byte) + HR value(1-2 bytes)
  const flags = value.getUint8(0);
  const hrValueFormat = flags & 0x01;  // 0=uint8, 1=uint16
  
  let heartRate;
  if (hrValueFormat) {
    heartRate = value.getUint16(1, /* littleEndian */ true);
  } else {
    heartRate = value.getUint8(1);
  }

  const now = Date.now();
  bandStatus.heartRate = heartRate;
  bandStatus.lastUpdate = now;
  bandStatus.heartRate = heartRate;

  // 记录历史
  _heartRateHistory.push({ ts: now, value: heartRate });
  if (_heartRateHistory.length > 200) _heartRateHistory.shift();

  bandStatus.heartRateHistory = _heartRateHistory.slice(-20);

  // 回调通知
  if (_onHeartRateCallback) {
    _onHeartRateCallback(heartRate, bandStatus);
  }
}

function onBandDisconnected() {
  console.warn('[BandBridge] 手环已断开连接');
  _isConnected = false;
  bandStatus.connected = false;
  bandStatus.deviceName = '';
  _bandServer = null;

  if (_heartRateChar) {
    _heartRateChar.removeEventListener('characteristicvaluechanged', onHeartRateChanged);
    _heartRateChar = null;
  }
}

async function tryReadDeviceInfo(service) {
  try {
    // 尝试读取设备名称
    const devNameChar = await service.getCharacteristic('gap.device_name').catch(() => null);
    if (devNameChar) {
      const nameData = await devNameChar.readValue();
      const decoder = new TextDecoder('utf-8');
      const name = decoder.decode(nameData);
      if (name) bandStatus.deviceName = name;
    }
  } catch {
    // 设备信息服务可选，失败忽略
  }
}

async function cleanupAfterError() {
  try {
    if (_heartRateChar) {
      _heartRateChar.removeEventListener('characteristicvaluechanged', onHeartRateChanged);
      try { await _heartRateChar.stopNotifications(); } catch {}
      _heartRateChar = null;
    }
    if (_bandServer && _bandServer.connected) {
      _bandServer.disconnect();
    }
  } catch {}
  _bandServer = null;
  _bandDevice = null;
  _isConnected = false;
}

// ── 设备缓存 (localStorage) ──
function cacheDeviceInfo(name, id) {
  try {
    localStorage.setItem(BAND_STORE_KEY, JSON.stringify({ name, id }));
  } catch {}
}

function getCachedDeviceInfo() {
  try {
    const raw = localStorage.getItem(BAND_STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearCachedDeviceInfo() {
  localStorage.removeItem(BAND_STORE_KEY);
}

// ── 导出全局 API ──
window.bandBridge = {
  isSupported: isWebBluetoothSupported,
  connect: connectBand,
  disconnect: disconnectBand,
  reconnect: reconnectLastDevice,
  onHeartRate,
  getStatus: () => ({ ...bandStatus }),
  getSummary: getHeartRateSummary,
  clearHistory: clearHeartRateHistory,
  getStatusText,
  isConnected: () => bandStatus.connected,
  getDeviceCache: getCachedDeviceInfo,
  clearCache: clearCachedDeviceInfo,
  getDiscoveredServices: () => [..._discoveredServices],
  getKnownServices: () => ({ ...KNOWN_SERVICES }),
};
