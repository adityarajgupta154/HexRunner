import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.use({ trace: 'off' });

const ONBOARDING_COMPLETE_KEY = '@hexrunner/paint-school-complete';
const ONBOARDING_PACE_KEY = '@hexrunner/onboarding-pace';
const ONBOARDING_COLOR_KEY = '@hexrunner/onboarding-territory-color';
const TEST_UID = 'device_first_launch_test';
const TEST_CREDENTIAL = `hr1.test.${'a'.repeat(43)}`;

const emptyStats = {
  userId: TEST_UID,
  displayName: 'Runner',
  totals: {
    totalRuns: 0,
    totalDistanceKm: 0,
    totalElapsedSeconds: 0,
    averagePaceMinPerKm: null,
    totalClaimedHexes: 0,
    totalHexesOwned: 0,
    totalNewHexes: 0,
    totalStolenHexes: 0,
    totalCredits: 0,
    totalBonusCredits: 0,
    currentStreak: 0,
    todayClaimedHexes: 0,
    dailyBudget: 10,
    todayBonusCredits: 0,
    dailyBonusCap: 5,
  },
  recentRuns: [],
  baseline: null,
  takeoverAlerts: [],
};

function statsFor(
  userId: string,
  baseline: {
    displayName: string;
    city: string;
    activityLevel: string;
    territoryColor: string;
    completedAt: string;
  } | null,
) {
  return {
    ...emptyStats,
    userId,
    baseline,
  };
}

async function prepareFirstLaunch(context: BrowserContext) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({
    latitude: 12.9716,
    longitude: 77.5946,
    accuracy: 8,
  });
  await context.addInitScript(
    ({ completeKey, paceKey, colorKey, uid, credential }) => {
      localStorage.clear();
      localStorage.removeItem(completeKey);
      localStorage.removeItem(paceKey);
      localStorage.removeItem(colorKey);
      localStorage.setItem('@hexrunner/anonymous-uid', uid);
      localStorage.setItem('hexrunner.anonymous-credential', credential);
    },
    {
      completeKey: ONBOARDING_COMPLETE_KEY,
      paceKey: ONBOARDING_PACE_KEY,
      colorKey: ONBOARDING_COLOR_KEY,
      uid: TEST_UID,
      credential: TEST_CREDENTIAL,
    },
  );

  await context.route('**/api/users/*/stats', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyStats) }),
  );
}

async function openOnboarding(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('onboarding-root')).toBeVisible();
  await expect(page.getByTestId('onboarding-skip')).toBeVisible();
  await expect(page.getByTestId('onboarding-next')).toBeVisible();
  await expect(page.getByTestId('onboarding-sign-in')).toBeVisible();
}

test('Skip leaves first-launch setup without saving a pace and keeps the default colour', async ({ context, page }) => {
  await prepareFirstLaunch(context);
  await openOnboarding(page);

  await page.getByTestId('onboarding-skip').click();

  await expect(page.getByTestId('onboarding-root')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        ({ completeKey, paceKey, colorKey }) => ({
          complete: localStorage.getItem(completeKey),
          pace: localStorage.getItem(paceKey),
          color: localStorage.getItem(colorKey),
        }),
        {
          completeKey: ONBOARDING_COMPLETE_KEY,
          paceKey: ONBOARDING_PACE_KEY,
          colorKey: ONBOARDING_COLOR_KEY,
        },
      ),
    )
    .toEqual({ complete: 'yes', pace: null, color: 'emerald' });
});

test('reduced motion uses still onboarding scenes instead of autoplaying video', async ({
  context,
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepareFirstLaunch(context);
  await openOnboarding(page);

  await expect(page.getByTestId('onboarding-poster')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);

  await page.getByTestId('onboarding-next').click();
  await expect(page.getByText('TAKE IT', { exact: true })).toBeVisible();
  await expect(page.getByTestId('onboarding-poster')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
});

test('protected-device identity guidance is available before entry', async ({ context, page }) => {
  await prepareFirstLaunch(context);
  await openOnboarding(page);

  await page.getByTestId('onboarding-sign-in').click();

  await expect(page.getByTestId('onboarding-identity-notice')).toContainText(
    'Your existing territory restores automatically on this device.',
  );
});

for (const { pace, tier } of [
  { pace: 'stride', tier: 'regular' },
  { pace: 'roam', tier: 'casual' },
  { pace: 'surge', tier: 'trained' },
] as const) {
  test(`${pace.toUpperCase()} enters the arena with the ${tier} baseline tier`, async ({
    context,
    page,
  }) => {
    await prepareFirstLaunch(context);
    await openOnboarding(page);

    let baselineBody: Record<string, unknown> | null = null;
    await context.route('**/api/users/*/baseline', async route => {
      baselineBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          displayName: 'Runner',
          city: baselineBody.city,
          activityLevel: baselineBody.activityLevel,
          territoryColor: baselineBody.territoryColor,
          completedAt: new Date().toISOString(),
        }),
      });
    });

    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId(`onboarding-pace-${pace}`).click();
    await page.getByTestId('onboarding-colour-cyan').click();
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-next').click();

    await expect(page.getByTestId('baseline-onboarding')).toHaveAttribute(
      'aria-label',
      `Baseline onboarding. ${tier} activity level selected`,
    );
    await expect
      .poll(() =>
        page.evaluate(
          ({ completeKey, paceKey, colorKey }) => ({
            complete: localStorage.getItem(completeKey),
            pace: localStorage.getItem(paceKey),
            color: localStorage.getItem(colorKey),
          }),
          {
            completeKey: ONBOARDING_COMPLETE_KEY,
            paceKey: ONBOARDING_PACE_KEY,
            colorKey: ONBOARDING_COLOR_KEY,
          },
        ),
      )
      .toEqual({ complete: 'yes', pace, color: 'cyan' });

    await page.getByTestId('baseline-city-input').fill('Bengaluru');
    await page.getByTestId('baseline-submit').click();
    await expect.poll(() => baselineBody).toMatchObject({
      city: 'Bengaluru',
      activityLevel: tier,
      territoryColor: 'cyan',
    });
  });
}

test.describe('fresh identity persistence', () => {
  test('keeps the runner UID and saved territory colour after reload', async ({
    context,
    page,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 8,
    });

    let registeredUid: string | null = null;
    let registrationCount = 0;
    let baseline: {
      displayName: string;
      city: string;
      activityLevel: string;
      territoryColor: string;
      completedAt: string;
    } | null = null;

    await context.route('**/api/anonymous-identities', async route => {
      const requestBody = route.request().postDataJSON() as {
        requestedUserId: string;
      };
      registeredUid = requestBody.requestedUserId;
      registrationCount += 1;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: registeredUid,
          credential: `hr1.test.${'b'.repeat(43)}`,
        }),
      });
    });

    await context.route('**/api/users/*/stats', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'cache-control': 'no-store',
          'x-hexrunner-test-color': baseline?.territoryColor ?? 'none',
        },
        body: JSON.stringify(statsFor(registeredUid ?? 'unregistered', baseline)),
      }),
    );

    await context.route('**/api/users/*/baseline', async route => {
      const requestBody = route.request().postDataJSON() as {
        city: string;
        activityLevel: string;
        territoryColor: string;
      };
      baseline = {
        displayName: 'Runner',
        city: requestBody.city,
        activityLevel: requestBody.activityLevel,
        territoryColor: requestBody.territoryColor,
        completedAt: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(baseline),
      });
    });

    await openOnboarding(page);
    await expect.poll(() => registeredUid).toMatch(/^device_[A-Za-z0-9_]+$/);

    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-pace-stride').click();
    await page.getByTestId('onboarding-colour-cyan').click();
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-next').click();

    await page.getByTestId('baseline-city-input').fill('Bengaluru');
    await page.getByTestId('baseline-submit').click();
    await expect.poll(() => baseline?.territoryColor).toBe('cyan');
    await expect(page.getByTestId('baseline-onboarding')).toBeHidden();

    await page.goto('/profile');
    await expect(page.getByTestId('profile-activity-list')).toBeVisible();
    const savedStatsResponse = page.waitForResponse(
      response =>
        response.url().includes('/api/users/') &&
        response.url().endsWith('/stats') &&
        response.headers()['x-hexrunner-test-color'] === 'violet',
    );
    await page.getByRole('radio', { name: 'Set territory colour violet' }).click();
    await expect.poll(() => baseline?.territoryColor).toBe('violet');
    await savedStatsResponse;

    const uidBeforeReload = await page.evaluate(() =>
      localStorage.getItem('@hexrunner/anonymous-uid'),
    );
    expect(uidBeforeReload).toBe(registeredUid);

    const reloadedStatsPayload = page
      .waitForResponse(response =>
        response.url().includes('/api/users/') &&
        response.url().endsWith('/stats') &&
        response.request().method() === 'GET' &&
        response.headers()['x-hexrunner-test-color'] === 'violet',
      )
      .then(response => response.json());
    await page.reload();
    await expect(reloadedStatsPayload).resolves.toMatchObject({
      userId: uidBeforeReload,
      baseline: { territoryColor: 'violet' },
    });

    await expect(page.getByTestId('onboarding-root')).toBeHidden();
    await expect(page.getByTestId('baseline-onboarding')).toBeHidden();
    await expect(page.getByTestId('profile-activity-list')).toBeVisible();
    await expect(
      page.getByLabel('Territory colour. violet selected.'),
    ).toBeVisible();
    await expect(
      page.getByRole('radio', { name: 'Set territory colour violet' }),
    ).toHaveCSS('border-width', '3px');
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem('@hexrunner/anonymous-uid'),
        ),
      )
      .toBe(uidBeforeReload);
    expect(registrationCount).toBe(1);
  });
});
