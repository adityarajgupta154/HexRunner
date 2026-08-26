import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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