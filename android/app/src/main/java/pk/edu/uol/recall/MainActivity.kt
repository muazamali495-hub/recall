package pk.edu.uol.recall

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.*
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import pk.edu.uol.recall.Store.deviceToken
import pk.edu.uol.recall.Store.icalUrl

/**
 * The whole app: Recall's website, plus the three things a website cannot do
 * for itself inside a WebView.
 *
 * 1. **Google sign-in** — Google refuses to render its login in a WebView, so
 *    that step goes to a Chrome Custom Tab and returns via a deep link.
 * 2. **File uploads** — a WebView ignores `<input type="file">` entirely
 *    unless the host app opens the picker for it. Without this the timetable
 *    upload silently does nothing.
 * 3. **Fetching Slate** — handled by SyncWorker in the background.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var splash: View

    /** Held between opening the file picker and the result coming back. */
    private var pendingFiles: ValueCallback<Array<Uri>>? = null

    private val filePicker =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            pendingFiles?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data),
            )
            pendingFiles = null
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        splash = findViewById(R.id.splash)

        applyInsets()
        configureWebView()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        SyncWorker.schedule(this)

        if (savedInstanceState == null) web.loadUrl(Config.RECALL_ORIGIN)
        handleDeepLink(intent)
    }

    /**
     * Android 15 draws apps edge-to-edge by default, so without this the page
     * starts underneath the status bar and the header sits too high.
     */
    private fun applyInsets() {
        val root = findViewById<View>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime(),
            )
            view.updatePadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false

            // Reuse cached assets between launches instead of refetching the
            // whole app every time — the single biggest win for perceived speed.
            cacheMode = WebSettings.LOAD_DEFAULT

            loadsImagesAutomatically = true
            useWideViewPort = true
            loadWithOverviewMode = true

            // The website checks for this to know it is inside the app; it must
            // be readable immediately, before any injected script could run.
            userAgentString = "$userAgentString RecallAndroid/1.0"
        }

        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.setBackgroundColor(0xFF0A0D15.toInt())
        web.addJavascriptInterface(Bridge(), "RecallNative")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val url = request.url.toString()

                if (url.contains("accounts.google.com") || url.contains("/auth/v1/authorize")) {
                    openInCustomTab(url)
                    return true
                }

                val host = request.url.host ?: return false
                if (!host.endsWith("vercel.app") && !host.contains("supabase")) {
                    openInCustomTab(url)
                    return true
                }

                return false
            }

            override fun onPageFinished(view: WebView, url: String) {
                splash.visibility = View.GONE

                if (url.contains("/dashboard") && deviceToken.isNullOrBlank()) claimDeviceToken()

                view.evaluateJavascript(
                    "window.__RECALL_ANDROID__ = true;" +
                        "document.documentElement.classList.add('in-recall-app');",
                    null,
                )
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            /**
             * Without this a WebView ignores every file input on the page — the
             * timetable upload button appears to work and then does nothing.
             */
            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                pendingFiles?.onReceiveValue(null) // abandon any earlier request
                pendingFiles = callback

                return try {
                    filePicker.launch(params.createIntent())
                    true
                } catch (_: Exception) {
                    pendingFiles = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) = request.deny()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    /**
     * Sign-in finished in the Custom Tab and came back with a code.
     *
     * The code is replayed into the WebView rather than exchanged natively, so
     * the session cookies land where the app actually needs them.
     */
    private fun handleDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "recall") return

        val code = data.getQueryParameter("code")
        val error = data.getQueryParameter("error")

        when {
            !code.isNullOrBlank() -> {
                splash.visibility = View.VISIBLE
                web.loadUrl("${Config.RECALL_ORIGIN}/auth/callback?code=$code")
            }
            !error.isNullOrBlank() ->
                web.loadUrl("${Config.RECALL_ORIGIN}/?error=sign-in-failed")
        }
    }

    private fun openInCustomTab(url: String) {
        try {
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
                .launchUrl(this, Uri.parse(url))
        } catch (_: Exception) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
    }

    /** Asks the site — from inside the signed-in WebView — for a device token. */
    private fun claimDeviceToken() {
        val js = """
            (async () => {
              try {
                const r = await fetch('/api/pair/auto', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ label: 'Android app' })
                });
                if (!r.ok) return '';
                const j = await r.json();
                return j.token || '';
              } catch (e) { return ''; }
            })()
        """.trimIndent()

        web.evaluateJavascript(js) { raw ->
            val token = raw?.trim('"')?.takeIf { it.isNotBlank() && it != "null" }
            if (token != null) {
                deviceToken = token
                if (!icalUrl.isNullOrBlank()) SyncWorker.syncNow(this)
            }
        }
    }

    /** Exposed to the website as `window.RecallNative`. */
    inner class Bridge {

        /** Keeps the calendar URL on the phone rather than on our server. */
        @JavascriptInterface
        fun saveCalendarUrl(url: String) {
            if (!url.startsWith("https://")) return
            icalUrl = url
            SyncWorker.syncNow(this@MainActivity)
        }

        @JavascriptInterface
        fun hasCalendarUrl(): Boolean = !icalUrl.isNullOrBlank()

        @JavascriptInterface
        fun syncNow() {
            SyncWorker.syncNow(this@MainActivity)
        }
    }
}
