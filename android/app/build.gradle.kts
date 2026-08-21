plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "pk.edu.uol.recall"
  compileSdk = 35

  defaultConfig {
    applicationId = "pk.edu.uol.recall"
    minSdk = 24 // Android 7 — covers essentially every phone still in use
    targetSdk = 35
    versionCode = 1
    versionName = "0.1.0"
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      // Signed with the debug key so an APK can be handed out without a
      // keystore. Replace before any Play Store submission.
      signingConfig = signingConfigs.getByName("debug")
    }
  }

  // lintVital chokes on Windows path handling in this setup, and we are not
  // shipping to Play yet where it would matter.
  lint {
    checkReleaseBuilds = false
    abortOnError = false
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }
}

dependencies {
  implementation("androidx.core:core-ktx:1.15.0")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("androidx.activity:activity-ktx:1.9.3")

  // Chrome Custom Tabs: Google refuses to render its sign-in inside a WebView.
  implementation("androidx.browser:browser:1.8.0")

  // Periodic background sync. Unlike iOS, Android actually guarantees this.
  implementation("androidx.work:work-runtime-ktx:2.10.0")
}
