/**
 * Home screen "Quick add" widget (§26), for iPhone and Android.
 *
 * The app is managed (CNG): `ios/` and `android/` are generated, so the widget
 * has to be produced by `expo prebuild`. This plugin adds
 *
 *   - an iOS WidgetKit extension target (`QuickAddWidget`) embedded into the
 *     app bundle's PlugIns directory, plus its Swift source and Info.plist, and
 *   - an Android `AppWidgetProvider` with its layout, drawable, string and
 *     `appwidget-provider` resources, registered in the manifest.
 *
 * Either widget is one button labelled "Quick add" that opens the app's
 * quick-add screen (`<scheme>://quick-add`, see app/quick-add.tsx). It shows no
 * data and takes no text input: the phone's long-press shortcut handles the
 * one-box entry point.
 *
 * No new native dependency is needed. The iOS target only imports WidgetKit and
 * SwiftUI (system frameworks), and the Android provider is a plain
 * `AppWidgetProvider`, so both are generated here rather than pulling in
 * `@bacons/apple-targets` or `react-native-android-widget` and their native
 * runtimes.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  withAndroidManifest,
  withDangerousMod,
  withXcodeProject,
} = require('@expo/config-plugins');

/** The route the widget opens, matching app/quick-add.tsx. */
const DEEP_LINK_PATH = '/quick-add';
const WIDGET_LABEL = 'Quick add';
/** Shown in the widget pickers (iOS `.description`, Android `android:description`). */
const WIDGET_DESCRIPTION = 'Open Quick add.';
/** The app's accent, matching the splash background in app.json. */
const ACCENT_COLOR = '#5c5595';

/** Name of the generated iOS widget extension target (and its bundle suffix). */
const IOS_WIDGET_NAME = 'QuickAddWidget';
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
// iOS
// ---------------------------------------------------------------------------

const COMMENT_KEY = /_comment$/;

function unquote(value) {
  if (typeof value !== 'string') return value;
  const match = /^"(.*)"$/.exec(value);
  return match ? match[1] : value;
}

function objectEntries(section) {
  return Object.entries(section || {}).filter(([key]) => !COMMENT_KEY.test(key));
}

/** The project's application target: the one the widget extension hangs off. */
function findApplicationTarget(objects) {
  for (const [uuid, target] of objectEntries(objects.PBXNativeTarget)) {
    if (target && String(target.productType).includes('com.apple.product-type.application')) {
      return { uuid, target };
    }
  }
  throw new Error('Cannot add the Quick add widget: the Xcode project has no application target.');
}

function findWidgetTarget(objects, widgetName) {
  for (const [uuid, target] of objectEntries(objects.PBXNativeTarget)) {
    if (target && unquote(target.name) === widgetName) return uuid;
  }
  return null;
}

/** Merge an app target's build settings so the extension matches the app. */
function readApplicationBuildSettings(objects, target) {
  const settings = {};
  const list = objects.XCConfigurationList?.[unquote(target.buildConfigurationList)];
  for (const configuration of list?.buildConfigurations ?? []) {
    const config = objects.XCBuildConfiguration?.[configuration.value];
    for (const [key, value] of Object.entries(config?.buildSettings ?? {})) {
      if (settings[key] === undefined) settings[key] = unquote(value);
    }
  }
  return settings;
}

function addCommentaryObject(objects, section, uuid, object, comment) {
  objects[section] = objects[section] || {};
  objects[section][uuid] = object;
  objects[section][`${uuid}_comment`] = comment;
}

/**
 * Add the WidgetKit extension target to a parsed Xcode project: the target, its
 * Swift source file, its build configurations, the dependency edge from the
 * app, and the "Embed Foundation Extensions" copy phase that ships the .appex
 * inside the app. Idempotent: re-running prebuild over an existing ios/ folder
 * does not duplicate the target.
 */
function addIosWidgetTarget(project, options) {
  const { widgetName, bundleIdentifier } = options;
  const objects = project.hash.project.objects;

  if (findWidgetTarget(objects, widgetName)) return project;

  const appTarget = findApplicationTarget(objects);
  const appSettings = readApplicationBuildSettings(objects, appTarget.target);

  const deploymentTarget = appSettings.IPHONEOS_DEPLOYMENT_TARGET || '15.1';
  const deviceFamily = appSettings.TARGETED_DEVICE_FAMILY || '1';
  const swiftVersion = appSettings.SWIFT_VERSION || '5.0';
  // EAS and this repo derive both numbers from the release tag, so copying them
  // keeps CFBundleVersion/CFBundleShortVersionString equal to the app's — App
  // Store Connect rejects an extension whose version does not match.
  const marketingVersion = options.marketingVersion || appSettings.MARKETING_VERSION || '1.0';
  const buildNumber = String(
    options.buildNumber || appSettings.CURRENT_PROJECT_VERSION || '1',
  );

  const uuid = () => project.generateUuid();
  const targetUuid = uuid();
  const productUuid = uuid();
  const groupUuid = uuid();
  const swiftRefUuid = uuid();
  const plistRefUuid = uuid();
  const swiftBuildFileUuid = uuid();
  const sourcesPhaseUuid = uuid();
  const frameworksPhaseUuid = uuid();
  const resourcesPhaseUuid = uuid();
  const embedPhaseUuid = uuid();
  const embedBuildFileUuid = uuid();
  const configListUuid = uuid();
  const debugConfigUuid = uuid();
  const releaseConfigUuid = uuid();
  const targetDependencyUuid = uuid();
  const containerProxyUuid = uuid();

  const appexName = `${widgetName}.appex`;

  // The extension bundle: WidgetKit appex, built into the products directory.
  addCommentaryObject(
    objects,
    'PBXFileReference',
    productUuid,
    {
      isa: 'PBXFileReference',
      explicitFileType: '"wrapper.app-extension"',
      includeInIndex: 0,
      path: appexName,
      sourceTree: 'BUILT_PRODUCTS_DIR',
    },
    appexName,
  );

  addCommentaryObject(
    objects,
    'PBXFileReference',
    swiftRefUuid,
    {
      isa: 'PBXFileReference',
      lastKnownFileType: 'sourcecode.swift',
      path: `${widgetName}.swift`,
      sourceTree: '"<group>"',
    },
    `${widgetName}.swift`,
  );

  addCommentaryObject(
    objects,
    'PBXFileReference',
    plistRefUuid,
    {
      isa: 'PBXFileReference',
      lastKnownFileType: 'text.plist.xml',
      path: 'Info.plist',
      sourceTree: '"<group>"',
    },
    'Info.plist',
  );

  addCommentaryObject(
    objects,
    'PBXGroup',
    groupUuid,
    {
      isa: 'PBXGroup',
      children: [
        { value: swiftRefUuid, comment: `${widgetName}.swift` },
        { value: plistRefUuid, comment: 'Info.plist' },
      ],
      path: widgetName,
      sourceTree: '"<group>"',
    },
    widgetName,
  );

  const projectUuid = project.hash.project.rootObject;
  const projectObject = objects.PBXProject[projectUuid];
  const mainGroup = objects.PBXGroup[unquote(projectObject.mainGroup)];
  if (mainGroup?.children) {
    // Keep the widget folder next to the app folder rather than last.
    mainGroup.children.splice(1, 0, { value: groupUuid, comment: widgetName });
  } else if (mainGroup) {
    mainGroup.children = [{ value: groupUuid, comment: widgetName }];
  }

  addCommentaryObject(
    objects,
    'PBXBuildFile',
    swiftBuildFileUuid,
    {
      isa: 'PBXBuildFile',
      fileRef: swiftRefUuid,
      fileRef_comment: `${widgetName}.swift`,
    },
    `${widgetName}.swift in Sources`,
  );

  addCommentaryObject(
    objects,
    'PBXSourcesBuildPhase',
    sourcesPhaseUuid,
    {
      isa: 'PBXSourcesBuildPhase',
      buildActionMask: 2147483647,
      files: [
        { value: swiftBuildFileUuid, comment: `${widgetName}.swift in Sources` },
      ],
      runOnlyForDeploymentPostprocessing: 0,
    },
    'Sources',
  );

  addCommentaryObject(
    objects,
    'PBXFrameworksBuildPhase',
    frameworksPhaseUuid,
    {
      isa: 'PBXFrameworksBuildPhase',
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    },
    'Frameworks',
  );

  addCommentaryObject(
    objects,
    'PBXResourcesBuildPhase',
    resourcesPhaseUuid,
    {
      isa: 'PBXResourcesBuildPhase',
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    },
    'Resources',
  );

  const buildSettings = {
    APPLICATION_EXTENSION_API_ONLY: 'YES',
    CODE_SIGN_STYLE: 'Automatic',
    CURRENT_PROJECT_VERSION: buildNumber,
    INFOPLIST_FILE: `${widgetName}/Info.plist`,
    IPHONEOS_DEPLOYMENT_TARGET: deploymentTarget,
    LD_RUNPATH_SEARCH_PATHS: [
      '"$(inherited)"',
      '"@executable_path/Frameworks"',
      '"@executable_path/../../Frameworks"',
    ],
    MARKETING_VERSION: marketingVersion,
    PRODUCT_BUNDLE_IDENTIFIER: `"${bundleIdentifier}"`,
    PRODUCT_NAME: '"$(TARGET_NAME)"',
    SKIP_INSTALL: 'YES',
    SWIFT_VERSION: swiftVersion,
    TARGETED_DEVICE_FAMILY: `"${deviceFamily}"`,
  };

  addCommentaryObject(
    objects,
    'XCBuildConfiguration',
    debugConfigUuid,
    { isa: 'XCBuildConfiguration', buildSettings: { ...buildSettings }, name: 'Debug' },
    'Debug',
  );
  addCommentaryObject(
    objects,
    'XCBuildConfiguration',
    releaseConfigUuid,
    { isa: 'XCBuildConfiguration', buildSettings: { ...buildSettings }, name: 'Release' },
    'Release',
  );

  addCommentaryObject(
    objects,
    'XCConfigurationList',
    configListUuid,
    {
      isa: 'XCConfigurationList',
      buildConfigurations: [
        { value: debugConfigUuid, comment: 'Debug' },
        { value: releaseConfigUuid, comment: 'Release' },
      ],
      defaultConfigurationIsVisible: 0,
      defaultConfigurationName: 'Release',
    },
    `Build configuration list for PBXNativeTarget "${widgetName}"`,
  );

  addCommentaryObject(
    objects,
    'PBXNativeTarget',
    targetUuid,
    {
      isa: 'PBXNativeTarget',
      buildConfigurationList: configListUuid,
      buildConfigurationList_comment: `Build configuration list for PBXNativeTarget "${widgetName}"`,
      buildPhases: [
        { value: sourcesPhaseUuid, comment: 'Sources' },
        { value: frameworksPhaseUuid, comment: 'Frameworks' },
        { value: resourcesPhaseUuid, comment: 'Resources' },
      ],
      buildRules: [],
      dependencies: [],
      name: widgetName,
      productName: widgetName,
      productReference: productUuid,
      productReference_comment: appexName,
      productType: '"com.apple.product-type.app-extension"',
    },
    widgetName,
  );

  if (projectObject.targets) {
    projectObject.targets.push({ value: targetUuid, comment: widgetName });
  } else {
    projectObject.targets = [{ value: targetUuid, comment: widgetName }];
  }

  // Xcode records the tool version each target was created with. Copy the app
  // target's so the generated extension looks like the rest of the project.
  const appToolsVersion = unquote(
    projectObject.attributes?.TargetAttributes?.[appTarget.uuid]?.CreatedOnToolsVersion,
  );
  projectObject.attributes = projectObject.attributes || {};
  projectObject.attributes.TargetAttributes = projectObject.attributes.TargetAttributes || {};
  projectObject.attributes.TargetAttributes[targetUuid] = {
    CreatedOnToolsVersion: appToolsVersion || '15.0',
  };

  const productsGroup = objects.PBXGroup[unquote(projectObject.productRefGroup)];
  if (productsGroup) {
    productsGroup.children = productsGroup.children || [];
    productsGroup.children.push({ value: productUuid, comment: appexName });
  }

  // The app depends on the extension, and copies it into PlugIns (spec 13).
  addCommentaryObject(
    objects,
    'PBXTargetDependency',
    targetDependencyUuid,
    {
      isa: 'PBXTargetDependency',
      target: targetUuid,
      target_comment: widgetName,
      targetProxy: containerProxyUuid,
      targetProxy_comment: 'PBXContainerItemProxy',
    },
    'PBXTargetDependency',
  );

  addCommentaryObject(
    objects,
    'PBXContainerItemProxy',
    containerProxyUuid,
    {
      isa: 'PBXContainerItemProxy',
      containerPortal: projectUuid,
      containerPortal_comment: 'Project object',
      proxyType: 1,
      remoteGlobalIDString: targetUuid,
      remoteInfo: widgetName,
    },
    'PBXContainerItemProxy',
  );

  addCommentaryObject(
    objects,
    'PBXBuildFile',
    embedBuildFileUuid,
    {
      isa: 'PBXBuildFile',
      fileRef: productUuid,
      fileRef_comment: appexName,
      settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
    },
    `${appexName} in Embed Foundation Extensions`,
  );

  addCommentaryObject(
    objects,
    'PBXCopyFilesBuildPhase',
    embedPhaseUuid,
    {
      isa: 'PBXCopyFilesBuildPhase',
      buildActionMask: 2147483647,
      dstPath: '""',
      dstSubfolderSpec: 13,
      files: [
        { value: embedBuildFileUuid, comment: `${appexName} in Embed Foundation Extensions` },
      ],
      name: '"Embed Foundation Extensions"',
      runOnlyForDeploymentPostprocessing: 0,
    },
    'Embed Foundation Extensions',
  );

  appTarget.target.buildPhases = appTarget.target.buildPhases || [];
  // Xcode 15+ reports a build cycle when "Embed Foundation Extensions" comes
  // after the app's script phases ("Embed Pods Frameworks", "Bundle React
  // Native code..."), which prebuild appends to the end. Put it directly after
  // the app's Resources phase instead.
  const resourcesIndex = appTarget.target.buildPhases.findIndex(
    (phase) => objects.PBXResourcesBuildPhase?.[phase.value],
  );
  appTarget.target.buildPhases.splice(
    resourcesIndex === -1 ? appTarget.target.buildPhases.length : resourcesIndex + 1,
    0,
    { value: embedPhaseUuid, comment: 'Embed Foundation Extensions' },
  );
  appTarget.target.dependencies = appTarget.target.dependencies || [];
  appTarget.target.dependencies.push({
    value: targetDependencyUuid,
    comment: 'PBXTargetDependency',
  });

  return project;
}

function swiftColor(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const red = ((value >> 16) & 0xff) / 255;
  const green = ((value >> 8) & 0xff) / 255;
  const blue = (value & 0xff) / 255;
  return `Color(red: ${red.toFixed(3)}, green: ${green.toFixed(3)}, blue: ${blue.toFixed(3)})`;
}

function iosWidgetSwift(options) {
  const { widgetName, deepLink, label, description, accent } = options;
  return `import SwiftUI
import WidgetKit

// Home screen "Quick add" widget (§26). One tap opens the app's quick-add
// screen through its URL scheme. The widget shows no data and takes no input.

private let quickAddURL = URL(string: "${deepLink}")!
private let quickAddAccent = ${swiftColor(accent)}

struct ${widgetName}Entry: TimelineEntry {
  let date: Date
}

struct ${widgetName}Provider: TimelineProvider {
  func placeholder(in context: Context) -> ${widgetName}Entry {
    ${widgetName}Entry(date: Date())
  }

  func getSnapshot(in context: Context, completion: @escaping (${widgetName}Entry) -> Void) {
    completion(${widgetName}Entry(date: Date()))
  }

  func getTimeline(
    in context: Context,
    completion: @escaping (Timeline<${widgetName}Entry>) -> Void
  ) {
    completion(Timeline(entries: [${widgetName}Entry(date: Date())], policy: .never))
  }
}

struct ${widgetName}View: View {
  var body: some View {
    VStack(spacing: 6) {
      Image(systemName: "plus.circle.fill")
        .font(.system(size: 22, weight: .semibold))
      Text("${label}")
        .font(.system(size: 13, weight: .semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .foregroundStyle(.white)
    .padding(8)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// iOS 17 replaced the plain background with the container background API.
private struct ${widgetName}Background: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(for: .widget) { quickAddAccent }
    } else {
      content.background(quickAddAccent)
    }
  }
}

@main
struct ${widgetName}: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "${widgetName}", provider: ${widgetName}Provider()) { _ in
      ${widgetName}View()
        .widgetURL(quickAddURL)
        .modifier(${widgetName}Background())
    }
    .configurationDisplayName("${label}")
    .description("${description}")
    .supportedFamilies([.systemSmall])
  }
}
`;
}

function iosWidgetInfoPlist(options) {
  const { label } = options;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>${label}</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>XPC!</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
	<key>CFBundleVersion</key>
	<string>$(CURRENT_PROJECT_VERSION)</string>
	<key>NSExtension</key>
	<dict>
		<key>NSExtensionPointIdentifier</key>
		<string>com.apple.widgetkit-extension</string>
	</dict>
</dict>
</plist>
`;
}

/** Write the extension's Swift source and Info.plist under `<ios>/<widgetName>`. */
function writeIosWidgetFiles(iosRoot, options) {
  const directory = path.join(iosRoot, options.widgetName);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `${options.widgetName}.swift`),
    iosWidgetSwift(options),
  );
  fs.writeFileSync(path.join(directory, 'Info.plist'), iosWidgetInfoPlist(options));
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
    widgetName: IOS_WIDGET_NAME,
    providerClass: ANDROID_PROVIDER_CLASS,
    deepLink,
    label: WIDGET_LABEL,
    description: WIDGET_DESCRIPTION,
    accent: ACCENT_COLOR,
  };

  config = withXcodeProject(config, (cfg) => {
    const bundleIdentifier = cfg.ios?.bundleIdentifier;
    if (!bundleIdentifier) {
      throw new Error(
        'The Quick add widget needs ios.bundleIdentifier in the app config to name its extension.',
      );
    }
    cfg.modResults = addIosWidgetTarget(cfg.modResults, {
      ...options,
      bundleIdentifier: `${bundleIdentifier}.${IOS_WIDGET_NAME}`,
      marketingVersion: cfg.version,
      buildNumber: cfg.ios?.buildNumber,
    });
    return cfg;
  });

  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      writeIosWidgetFiles(cfg.modRequest.platformProjectRoot, options);
      return cfg;
    },
  ]);

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
module.exports.IOS_WIDGET_NAME = IOS_WIDGET_NAME;
module.exports.WIDGET_LABEL = WIDGET_LABEL;
module.exports.getDeepLink = getDeepLink;
module.exports.addIosWidgetTarget = addIosWidgetTarget;
module.exports.writeIosWidgetFiles = writeIosWidgetFiles;
module.exports.addAndroidWidgetReceiver = addAndroidWidgetReceiver;
module.exports.writeAndroidWidgetFiles = writeAndroidWidgetFiles;
