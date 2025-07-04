import { CommandError } from '../../../../utils/errors';
import {
  Device,
  getAdbNameForDeviceIdAsync,
  getAttachedDevicesAsync,
  getDeviceABIsAsync,
  getPropertyDataForDeviceAsync,
  getServer,
  isBootAnimationCompleteAsync,
  isDeviceBootedAsync,
  isPackageInstalledAsync,
  launchActivityAsync,
  openAppIdAsync,
  sanitizeAdbDeviceName,
  openUrlAsync,
} from '../adb';

jest.mock('../ADBServer', () => ({
  ADBServer: jest.fn(() => ({
    runAsync: jest.fn(async () => ''),
    getFileOutputAsync: jest.fn(async () => ''),
  })),
}));

const asDevice = (device: Partial<Device>): Device => device as Device;

const device = asDevice({ name: 'Pixel 5', pid: '123' });

describe(openUrlAsync, () => {
  it(`escapes & in the url`, async () => {
    await openUrlAsync(device, { url: 'acme://foo?bar=1&baz=2' });
    expect(getServer().runAsync).toHaveBeenCalledWith([
      '-s',
      '123',
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      // Ensure this is escaped
      'acme://foo?bar=1\\&baz=2',
    ]);
  });
});

describe(launchActivityAsync, () => {
  it(`asserts that the launch activity does not exist`, async () => {
    jest
      .mocked(getServer().runAsync)
      .mockResolvedValueOnce('Error: Activity class dev.bacon.app/.MainActivity does not exist.');
    await expect(
      launchActivityAsync(device, {
        launchActivity: 'dev.bacon.app/.MainActivity',
      })
    ).rejects.toThrow(CommandError);
  });
  it(`launches activity`, async () => {
    jest.mocked(getServer().runAsync).mockResolvedValueOnce('...');
    await launchActivityAsync(device, {
      launchActivity: 'dev.bacon.app/.MainActivity',
    });
    expect(getServer().runAsync).toHaveBeenCalledWith([
      '-s',
      '123',
      'shell',
      'am',
      'start',
      '-f',
      '0x20000000',
      '-n',
      'dev.bacon.app/.MainActivity',
    ]);
  });
  it(`launches activity with url`, async () => {
    jest.mocked(getServer().runAsync).mockResolvedValueOnce('...');
    await launchActivityAsync(device, {
      launchActivity: 'dev.expo.custom.appid/dev.bacon.app.MainActivity',
      url: 'exp+expo-test://expo-development-client/?url=http%3A%2F%2F192.168.86.186%3A8081',
    });
    expect(getServer().runAsync).toHaveBeenCalledWith([
      '-s',
      '123',
      'shell',
      'am',
      'start',
      '-f',
      '0x20000000',
      '-n',
      'dev.expo.custom.appid/dev.bacon.app.MainActivity',
      '-d',
      'exp+expo-test://expo-development-client/?url=http%3A%2F%2F192.168.86.186%3A8081',
    ]);
  });
});

describe(isPackageInstalledAsync, () => {
  it(`returns true when a package is installed`, async () => {
    jest
      .mocked(getServer().runAsync)
      .mockResolvedValueOnce(
        [
          'package:com.google.android.networkstack.tethering',
          'package:com.android.cts.priv.ctsshim',
          'package:com.google.android.youtube',
        ].join('\n')
      );
    expect(await isPackageInstalledAsync(device, 'com.google.android.youtube')).toBe(true);
    expect(getServer().runAsync).toHaveBeenCalledWith([
      '-s',
      '123',
      'shell',
      'pm',
      'list',
      'packages',
      '--user',
      '0',
      'com.google.android.youtube',
    ]);
  });
  it(`returns false when a package is not isntalled`, async () => {
    jest.mocked(getServer().runAsync).mockResolvedValueOnce('');
    expect(await isPackageInstalledAsync(device, 'com.google.android.youtube')).toBe(false);
  });
});

describe(openAppIdAsync, () => {
  it(`asserts that the app does not exist`, async () => {
    jest
      .mocked(getServer().runAsync)
      .mockResolvedValueOnce('Error: Activity not started, unable to resolve Intent');
    await expect(
      openAppIdAsync(device, {
        applicationId: 'dev.bacon.app',
      })
    ).rejects.toThrow(CommandError);
  });
});

describe(getAdbNameForDeviceIdAsync, () => {
  it(`returns a device name`, async () => {
    jest.mocked(getServer().runAsync).mockResolvedValueOnce(['Pixel_4_XL_API_30', 'OK'].join('\n'));

    expect(await getAdbNameForDeviceIdAsync(asDevice({ pid: 'emulator-5554' }))).toBe(
      'Pixel_4_XL_API_30'
    );
  });
  it(`asserts when a device is not found`, async () => {
    jest
      .mocked(getServer().runAsync)
      .mockResolvedValueOnce('error: could not connect to TCP port 55534: Connection refused');

    await expect(getAdbNameForDeviceIdAsync(asDevice({ pid: 'emulator-5554' }))).rejects.toThrow(
      CommandError
    );
  });
});

describe(isDeviceBootedAsync, () => {
  it(`returns a device when booted`, async () => {
    jest
      .mocked(getServer().runAsync)
      .mockResolvedValueOnce(
        [
          'List of devices attached',
          'emulator-5554          device product:sdk_gphone_x86_arm model:sdk_gphone_x86_arm device:generic_x86_arm transport_id:1',
          '',
        ].join('\n')
      )
      .mockResolvedValueOnce(
        // Return the emulator name
        ['Pixel_4_XL_API_30', 'OK'].join('\n')
      );

    expect(await isDeviceBootedAsync(asDevice({ name: 'Pixel_4_XL_API_30' }))).toStrictEqual({
      isAuthorized: true,
      isBooted: true,
      name: 'Pixel_4_XL_API_30',
      pid: 'emulator-5554',
      type: 'emulator',
    });
  });

  it(`returns null when the device is not booted`, async () => {
    jest.mocked(getServer().runAsync).mockResolvedValueOnce('');
    expect(await isDeviceBootedAsync(device)).toBe(null);
  });
});

describe(getAttachedDevicesAsync, () => {
  it(`gets devices`, async () => {
    jest
      .mocked(getServer().runAsync)
      .mockResolvedValueOnce(
        [
          'List of devices attached',
          // unauthorized
          'FA8251A00719 unauthorized usb:338690048X transport_id:5',
          // authorized
          'FA8251A00720 device usb:338690048X product:walleye model:Pixel_2 device:walleye transport_id:4',
          // Emulator
          'emulator-5554          device product:sdk_gphone_x86_arm model:sdk_gphone_x86_arm device:generic_x86_arm transport_id:1',
          '',
        ].join('\n')
      )
      .mockResolvedValueOnce(
        // Return the emulator name
        ['Pixel_4_XL_API_30', 'OK'].join('\n')
      );

    const devices = await getAttachedDevicesAsync();

    expect(devices).toEqual([
      {
        isAuthorized: false,
        isBooted: true,
        name: 'Device FA8251A00719',
        pid: 'FA8251A00719',
        type: 'device',
        connectionType: 'USB',
      },
      {
        isAuthorized: true,
        isBooted: true,
        name: 'Pixel_2',
        pid: 'FA8251A00720',
        type: 'device',
        connectionType: 'USB',
      },
      {
        isAuthorized: true,
        isBooted: true,
        name: 'Pixel_4_XL_API_30',
        pid: 'emulator-5554',
        type: 'emulator',
      },
    ]);
  });

  it(`gets network connected devices`, async () => {
    jest
      .mocked(getServer().runAsync)
      .mockResolvedValueOnce(
        [
          'List of devices attached',
          // unauthorized
          'adb-00000XXX000XXX-YzYyyy._adb-tls-connect._tcp. offline transport_id:1',
          // authorized & online
          'adb-00000XXX000XXX-YzXxxx._adb-tls-connect._tcp. device product:cheetah model:Pixel_7_Pro device:cheetah transport_id:2',
          // authorized & offline
          'adb-00000XXX000XXX-YzZzzz._adb-tls-connect._tcp. offline product:cheetah model:Pixel_7_Pro device:cheetah transport_id:2',
          // Emulator
          'emulator-5554          device product:sdk_gphone_x86_arm model:sdk_gphone_x86_arm device:generic_x86_arm transport_id:1',
          '',
        ].join('\n')
      )
      .mockResolvedValueOnce(
        // Return the emulator name
        ['Pixel_4_XL_API_30', 'OK'].join('\n')
      );

    const devices = await getAttachedDevicesAsync();

    expect(devices).toEqual([
      {
        isAuthorized: false,
        isBooted: false,
        name: 'Device adb-00000XXX000XXX-YzYyyy._adb-tls-connect._tcp.',
        pid: 'adb-00000XXX000XXX-YzYyyy._adb-tls-connect._tcp.',
        type: 'device',
        connectionType: 'Network',
      },
      {
        isAuthorized: true,
        isBooted: true,
        name: 'Pixel_7_Pro',
        pid: 'adb-00000XXX000XXX-YzXxxx._adb-tls-connect._tcp.',
        type: 'device',
        connectionType: 'Network',
      },
      {
        isAuthorized: true,
        isBooted: false,
        name: 'Pixel_7_Pro',
        pid: 'adb-00000XXX000XXX-YzZzzz._adb-tls-connect._tcp.',
        type: 'device',
        connectionType: 'Network',
      },
      {
        isAuthorized: true,
        isBooted: true,
        name: 'Pixel_4_XL_API_30',
        pid: 'emulator-5554',
        type: 'emulator',
      },
    ]);
  });

  it(`gets devices when ADB_TRACE is set`, async () => {
    jest
      .mocked(getServer().runAsync)
      .mockResolvedValueOnce(
        [
          'List of devices attached',
          'adb D 03-06 15:25:53 63677 4018815 adb_client.cpp:393] adb_query: host:devices-l',
          'adb D 03-06 15:25:53 63677 4018815 adb_client.cpp:351] adb_connect: service: host:devices-l',
          'adb D 03-06 15:25:53 63677 4018815 adb_client.cpp:160] _adb_connect: host:devices-l',
          'adb D 03-06 15:25:53 63677 4018815 adb_client.cpp:194] _adb_connect: return fd 3',
          'adb D 03-06 15:25:53 63677 4018815 adb_client.cpp:369] adb_connect: return fd 3',
          // Emulator
          'emulator-5554          offline transport_id:1',
          '',
        ].join('\n')
      )
      .mockResolvedValueOnce(
        // Return the emulator name
        ['Pixel_4_XL_API_30', 'OK'].join('\n')
      );

    const devices = await getAttachedDevicesAsync();

    expect(devices).toEqual([
      {
        isAuthorized: true,
        isBooted: true,
        name: 'Pixel_4_XL_API_30',
        pid: 'emulator-5554',
        type: 'emulator',
      },
    ]);
  });
});

describe(isBootAnimationCompleteAsync, () => {
  it(`returns true if the boot animation is complete for a device`, async () => {
    jest
      .mocked(getServer().getFileOutputAsync)
      .mockResolvedValueOnce(['[init.svc.bootanim]: [stopped]'].join('\n'));

    await expect(isBootAnimationCompleteAsync()).resolves.toBe(true);
  });
  it(`returns false if the boot animation is not complete`, async () => {
    jest
      .mocked(getServer().getFileOutputAsync)
      .mockResolvedValueOnce(['[init.svc.bootanim]: [running]'].join('\n'));
    await expect(isBootAnimationCompleteAsync()).resolves.toBe(false);
  });
  it(`returns false if the properties cannot be read`, async () => {
    jest.mocked(getServer().getFileOutputAsync).mockImplementationOnce(() => {
      throw new Error('File not found');
    });

    await expect(isBootAnimationCompleteAsync()).resolves.toBe(false);
  });
});

describe(getPropertyDataForDeviceAsync, () => {
  it(`returns parsed property data`, async () => {
    jest.mocked(getServer().getFileOutputAsync).mockResolvedValueOnce(
      [
        '[wifi.direct.interface]: [p2p-dev-wlan0]',
        '[init.svc.bootanim]: [stopped]',
        '[wifi.interface]: [wlan0]',
        // Should be stripped
        '[invalid]: foobar',
      ].join('\n')
    );

    await expect(getPropertyDataForDeviceAsync(asDevice({ pid: '123' }))).resolves.toStrictEqual({
      'init.svc.bootanim': 'stopped',
      'wifi.direct.interface': 'p2p-dev-wlan0',
      'wifi.interface': 'wlan0',
    });
  });
});

describe(getDeviceABIsAsync, () => {
  it(`returns a list of device ABIs`, async () => {
    jest
      .mocked(getServer().getFileOutputAsync)
      .mockResolvedValueOnce(['x86,armeabi-v7a,armeabi', ''].join('\n'));
    await expect(isBootAnimationCompleteAsync()).resolves.toBe(false);
  });
});

describe(sanitizeAdbDeviceName, () => {
  it(`returns the avd device name from single line`, () => {
    expect(sanitizeAdbDeviceName('Pixel_3_API_28')).toBe('Pixel_3_API_28');
  });

  it(`returns the avd device name from multi line with LF`, () => {
    expect(sanitizeAdbDeviceName(`Pixel_4_API_29\nOK`)).toBe('Pixel_4_API_29');
  });

  it(`returns the avd device name from multi line with CR LF`, () => {
    expect(sanitizeAdbDeviceName(`Pixel_5_API_30\r\nOK`)).toBe('Pixel_5_API_30');
  });

  it(`returns the avd device name from multi line with CR`, () => {
    expect(sanitizeAdbDeviceName(`Pixel_6_API_31\rOK`)).toBe('Pixel_6_API_31');
  });
});
