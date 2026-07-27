const mockInitialize = jest.fn();
const mockGetConsentInfo = jest.fn();
const mockGatherConsent = jest.fn();
const mockShowPrivacyOptionsForm = jest.fn();
const mockTrack = jest.fn();

jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  default: () => ({ initialize: mockInitialize }),
  AdsConsent: {
    getConsentInfo: mockGetConsentInfo,
    gatherConsent: mockGatherConsent,
    showPrivacyOptionsForm: mockShowPrivacyOptionsForm,
  },
  AdsConsentPrivacyOptionsRequirementStatus: {
    UNKNOWN: 'UNKNOWN',
    REQUIRED: 'REQUIRED',
    NOT_REQUIRED: 'NOT_REQUIRED',
  },
}));

jest.mock('../../telemetry', () => ({ track: mockTrack }));

type AdsStateModule = typeof import('../adsState');

function freshAds(): AdsStateModule {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../adsState');
}

function info(over: Partial<{ canRequestAds: boolean; privacyOptionsRequirementStatus: string }> = {}) {
  return {
    status: 'OBTAINED',
    isConsentFormAvailable: true,
    canRequestAds: false,
    privacyOptionsRequirementStatus: 'NOT_REQUIRED',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps implementations, so a persistent mockRejectedValue
  // set by one test would leak into the next — re-set the default here.
  mockInitialize.mockResolvedValue([]);
});

describe('initAds', () => {
  test('starts the SDK once when a previous session already allows ads', async () => {
    mockGetConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: true }));
    const ads = freshAds();
    await ads.initAds();
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockGatherConsent).toHaveBeenCalledTimes(1);
    expect(ads.getAdsState()).toEqual({ canShowAds: true, isPrivacyOptionsRequired: false });
  });

  test('first-run EEA user: SDK starts only after the consent form grants', async () => {
    mockGetConsentInfo
      .mockResolvedValueOnce(info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' }))
      .mockResolvedValue(info({ canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }));
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: true }));
    const ads = freshAds();
    await ads.initAds();
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(ads.getAdsState()).toEqual({ canShowAds: true, isPrivacyOptionsRequired: true });
  });

  test('never initializes the SDK while consent forbids ad requests', async () => {
    mockGetConsentInfo.mockResolvedValue(
      info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' }),
    );
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: false }));
    const ads = freshAds();
    await ads.initAds();
    expect(mockInitialize).not.toHaveBeenCalled();
    expect(ads.getAdsState()).toEqual({ canShowAds: false, isPrivacyOptionsRequired: true });
  });

  test('gatherConsent failure never throws, is tracked, and keeps the previous-session fast path', async () => {
    mockGetConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    mockGatherConsent.mockRejectedValue(new Error('ump down'));
    const ads = freshAds();
    await expect(ads.initAds()).resolves.toBeUndefined();
    expect(mockTrack).toHaveBeenCalledWith('ads_init_failed', {});
    expect(ads.getAdsState().canShowAds).toBe(true); // previous session's consent still applies
  });

  test('is idempotent — a second call does not re-run consent', async () => {
    mockGetConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: true }));
    const ads = freshAds();
    await ads.initAds();
    await ads.initAds();
    expect(mockGatherConsent).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  test('retries SDK init after a fast-path initialize failure', async () => {
    mockGetConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: true }));
    mockInitialize.mockRejectedValueOnce(new Error('gma down'));
    const ads = freshAds();
    await ads.initAds();
    expect(mockInitialize).toHaveBeenCalledTimes(2);
    expect(ads.getAdsState().canShowAds).toBe(true);
    expect(mockTrack).not.toHaveBeenCalled();
  });

  test('tracks ads_init_failed and stays hidden when SDK init keeps failing', async () => {
    mockGetConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: true }));
    mockInitialize.mockRejectedValue(new Error('gma down'));
    const ads = freshAds();
    await expect(ads.initAds()).resolves.toBeUndefined();
    expect(ads.getAdsState().canShowAds).toBe(false);
    expect(mockTrack).toHaveBeenCalledWith('ads_init_failed', {});
  });
});

describe('showAdsPrivacyOptions', () => {
  test('re-syncs state after the form — withdrawing consent hides ads', async () => {
    mockGetConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: true }));
    const ads = freshAds();
    await ads.initAds();
    expect(ads.getAdsState().canShowAds).toBe(true);

    mockGetConsentInfo.mockResolvedValue(
      info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' }),
    );
    mockShowPrivacyOptionsForm.mockResolvedValue(info({ canRequestAds: false }));
    ads.showAdsPrivacyOptions();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ads.getAdsState()).toEqual({ canShowAds: false, isPrivacyOptionsRequired: true });
  });

  test('tracks ads_init_failed when re-consent init fails on the privacy-form path', async () => {
    mockGetConsentInfo.mockResolvedValue(
      info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' }),
    );
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: false }));
    const ads = freshAds();
    await ads.initAds();
    expect(mockInitialize).not.toHaveBeenCalled();

    mockGetConsentInfo.mockResolvedValue(
      info({ canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }),
    );
    mockShowPrivacyOptionsForm.mockResolvedValue(info({ canRequestAds: true }));
    mockInitialize.mockRejectedValueOnce(new Error('gma down'));
    ads.showAdsPrivacyOptions();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTrack).toHaveBeenCalledWith('ads_init_failed', {});
    expect(ads.getAdsState().canShowAds).toBe(false);
  });
});
