/**
 * Home screen "Quick add" widget (§26), Android. (The iPhone widget lands
 * separately, once its extension's signing is set up.)
 *
 * The app is managed (CNG): `ios/` and `android/` are generated, so the widget
 * has to be produced by `expo prebuild`. This plugin adds an Android
 * `AppWidgetProvider` with its layout, drawable, string and
 * `appwidget-provider` resources, registered in the manifest.
 *
 * The widget is one button labelled "Quick add" that opens the app's
 * quick-add screen (`<scheme>://quick-add`, see app/quick-add.tsx). It shows no
 * data and takes no text input: the phone's long-press shortcut handles the
 * one-box entry point.
 *
 * No new native dependency is needed: the provider is a plain
 * `AppWidgetProvider`, generated here rather than pulling in
 * `react-native-android-widget` and its native runtime.
 */
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

/** The route the widget opens, matching app/quick-add.tsx. */
const DEEP_LINK_PATH = '/quick-add';
const WIDGET_LABEL = 'Quick add';
/** Shown in the widget picker (`android:description`). */
const WIDGET_DESCRIPTION = 'Open Quick add.';
/** The app's accent, matching the splash background in app.json. */
const ACCENT_COLOR = '#5c5595';

/** Name of the generated Android AppWidgetProvider class. */
const ANDROID_PROVIDER_CLASS = 'QuickAddWidgetProvider';

const ANDROID_LAYOUT = 'quick_add_widget';
const ANDROID_INFO = 'quick_add_widget_info';
const ANDROID_BACKGROUND = 'quick_add_widget_background';
const ANDROID_LABEL_RESOURCE = 'quick_add_widget_label';
const ANDROID_DESCRIPTION_RESOURCE = 'quick_add_widget_description';

/** `<scheme>://quick-add`, from the app's first configured URL scheme. */
function getDeepLink(config) {
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  if (!scheme) {
    throw new Error(
      'The Quick add widget needs an app URL scheme (expo.scheme in app.json) to deep-link to ' +
        `${DEEP_LINK_PATH}.`,
    );
  }
  return `${scheme}://${DEEP_LINK_PATH.replace(/^\//, '')}`;
}

// ---------------------------------------------------------------------------
// Android
// ---------------------------------------------------------------------------

/**
 * Register the widget's AppWidgetProvider in AndroidManifest.xml. The provider
 * is not exported: only the system's APPWIDGET_UPDATE broadcast reaches it.
 * Idempotent for a re-run over an existing android/ folder.
 */
function addAndroidWidgetReceiver(androidManifest, options) {
  const { providerClass } = options;
  const application = androidManifest?.manifest?.application?.[0];
  if (!application) {
    throw new Error(
      'Cannot add the Quick add widget: AndroidManifest.xml has no <application> element.',
    );
  }

  const receiverName = `.${providerClass}`;
  application.receiver = application.receiver || [];
  const existing = application.receiver.find(
    (receiver) => receiver.$?.['android:name'] === receiverName,
  );
  if (existing) return androidManifest;

  application.receiver.push({
    $: {
      'android:name': receiverName,
      'android:exported': 'false',
      'android:label': `@string/${ANDROID_LABEL_RESOURCE}`,
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
      },
    ],
    'meta-data': [
      {
        $: {
          'android:name': 'android.appwidget.provider',
          'android:resource': `@xml/${ANDROID_INFO}`,
        },
      },
    ],
  });

  return androidManifest;
}

function androidProviderKotlin(options) {
  const { packageName, providerClass, deepLink } = options;
  return `package ${packageName}

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * Home screen "Quick add" widget (§26): one button that opens the app's
 * quick-add screen. No data is shown and no text is entered here.
 */
class ${providerClass} : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    for (appWidgetId in appWidgetIds) {
      appWidgetManager.updateAppWidget(appWidgetId, buildViews(context))
    }
  }

  private fun buildViews(context: Context): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.${ANDROID_LAYOUT})
    val intent = Intent(context, MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse(DEEP_LINK)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pendingIntent = PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    views.setOnClickPendingIntent(R.id.${ANDROID_LAYOUT}_root, pendingIntent)
    return views
  }

  companion object {
    private const val DEEP_LINK = "${deepLink}"
  }
}
`;
}

function androidLayout() {
  return `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/${ANDROID_LAYOUT}_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/${ANDROID_BACKGROUND}"
  android:gravity="center"
  android:orientation="horizontal"
  android:padding="8dp">
  <TextView
    android:id="@+id/${ANDROID_LAYOUT}_label"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:text="@string/${ANDROID_LABEL_RESOURCE}"
    android:textColor="#FFFFFF"
    android:textSize="13sp"
    android:textStyle="bold" />
</LinearLayout>
`;
}

function androidWidgetInfo() {
  return `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="110dp"
  android:minHeight="40dp"
  android:targetCellWidth="2"
  android:targetCellHeight="1"
  android:initialLayout="@layout/${ANDROID_LAYOUT}"
  android:previewLayout="@layout/${ANDROID_LAYOUT}"
  android:description="@string/${ANDROID_DESCRIPTION_RESOURCE}"
  android:resizeMode="none"
  android:updatePeriodMillis="0"
  android:widgetCategory="home_screen" />
`;
}

function androidBackground(accent) {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
  android:shape="rectangle">
  <solid android:color="${accent}" />
  <corners android:radius="16dp" />
</shape>
`;
}

function androidStrings(label, description) {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="${ANDROID_LABEL_RESOURCE}">${label}</string>
  <string name="${ANDROID_DESCRIPTION_RESOURCE}">${description}</string>
</resources>
`;
}

/** Write the provider, layout and resources under `<android>/app/src/main`. */
function writeAndroidWidgetFiles(androidRoot, options) {
  const { packageName, providerClass, label, description, accent } = options;
  const mainRoot = path.join(androidRoot, 'app', 'src', 'main');
  const packageDir = path.join(mainRoot, 'java', ...packageName.split('.'));
  const resDir = path.join(mainRoot, 'res');

  const files = [
    [path.join(packageDir, `${providerClass}.kt`), androidProviderKotlin(options)],
    [path.join(resDir, 'layout', `${ANDROID_LAYOUT}.xml`), androidLayout()],
    [path.join(resDir, 'xml', `${ANDROID_INFO}.xml`), androidWidgetInfo()],
    [path.join(resDir, 'drawable', `${ANDROID_BACKGROUND}.xml`), androidBackground(accent)],
    [path.join(resDir, 'values', 'quick_add_widget_strings.xml'), androidStrings(label, description)],
  ];

  for (const [filepath, contents] of files) {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, contents);
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

function withQuickAddWidget(config) {
  const deepLink = getDeepLink(config);
  const options = {
    providerClass: ANDROID_PROVIDER_CLASS,
    deepLink,
    label: WIDGET_LABEL,
    description: WIDGET_DESCRIPTION,
    accent: ACCENT_COLOR,
  };

  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = addAndroidWidgetReceiver(cfg.modResults, options);
    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const packageName = cfg.android?.package;
      if (!packageName) {
        throw new Error(
          'The Quick add widget needs android.package in the app config to place its provider.',
        );
      }
      writeAndroidWidgetFiles(cfg.modRequest.platformProjectRoot, {
        ...options,
        packageName,
      });
      return cfg;
    },
  ]);

  return config;
}

module.exports = withQuickAddWidget;
module.exports.ACCENT_COLOR = ACCENT_COLOR;
module.exports.ANDROID_PROVIDER_CLASS = ANDROID_PROVIDER_CLASS;
module.exports.DEEP_LINK_PATH = DEEP_LINK_PATH;
module.exports.WIDGET_LABEL = WIDGET_LABEL;
module.exports.getDeepLink = getDeepLink;
module.exports.addAndroidWidgetReceiver = addAndroidWidgetReceiver;
module.exports.writeAndroidWidgetFiles = writeAndroidWidgetFiles;
