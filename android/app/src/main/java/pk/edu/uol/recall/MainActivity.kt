package pk.edu.uol.recall

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.graphics.toColorInt
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import pk.edu.uol.recall.Store.deviceToken
import pk.edu.uol.recall.Store.icalUrl

/**
 * The whole app: Recall's website, plus the two things a website cannot do.
 *
 * 1. **Google sign-in.** Google refuses to render its login inside a WebView,
 *    so that one step opens in a Chrome Custom Tab and comes back through a
 *    deep link. Everything else stays in the app.
 *
 * 2. **Fetching Slate.** Handled by SyncWorker in the background.
 *
 * There is no pairing screen. Once the student is signed in, the app quietly
 * mints its own device token — asking someone to copy a code between two
 * halves of the same app would be friction for nothing.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var progress: ProgressBar

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        progress = findViewById(R.id.progress)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false

            // The website checks for this to know it is inside the app — it must
            // be readable immediately, before any script we inject could run.
            userAgentString = "$userAgentString RecallAndroid/1.0"
        }

        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        // Lets the website hand the calendar URL to the native side, so it can
        // be stored on the phone instead of on our server.
        web.addJavascriptInterface(Bridge(), "RecallNative")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val url = request.url.toString()

                // Google blocks its sign-in inside WebViews. Send that one
                // journey to a Custom Tab, which is a real Chrome window.
                if (url.contains("accounts.google.com") || url.contains("/auth/v1/authorize")) {
                    openInCustomTab(url)
                    return true
                }

                // Anything genuinely external (Slate links from a deadline
                // card, for instance) belongs in the browser, not in here.
                val host = request.url.host ?: return false
                if (!host.endsWith("vercel.app") && !host.contains("supabase")) {
                    openInCustomTab(url)
                    return true
                }

                return false
            }

            override fun onPageFinished(view: WebView, url: String) {
                progress.visibility = View.GONE

                // Signed in — make sure this device can sync.
                if (url.contains("/dashboard") && deviceToken.isNullOrBlank()) {
                    claimDeviceToken()
                }

                // Tell the page it is running inside the app, so it can offer
                // the native calendar-URL flow instead of the extension one.
                view.evaluateJavascript(
                    "window.__RECALL_ANDROID__ = true;" +
                        "document.documentElement.classList.add('in-recall-app');",
                    null,
                )
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                progress.visibility = View.VISIBLE
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) = request.deny()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        SyncWorker.schedule(this)

        // Open on whatever the site decides: landing page when signed out,
        // dashboard when signed in.
        if (savedInstanceState == null) web.loadUrl(Config.RECALL_ORIGIN)

        handleDeepLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    /**
     * Sign-in finished in the Custom Tab and bounced back to us with a code.
     *
     * We hand that code to the WebView rather than exchanging it natively, so
     * the session cookies land where the app actually needs them.
     */
    private fun handleDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "recall") return

        val code = data.getQueryParameter("code")
        val error = data.getQueryParameter("error")

        when {
            !code.isNullOrBlank() ->
                web.loadUrl("${Config.RECALL_ORIGIN}/auth/callback?code=$code")

            !error.isNullOrBlank() ->
                web.loadUrl("${Config.RECALL_ORIGIN}/?error=sign-in-failed")
        }
    }

    private fun openInCustomTab(url: String) {
        try {
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setUrlBarHidingEnabled(false)
                .build()
                .also { it.intent.putExtra("android.intent.extra.REFERRER", Uri.parse("android-app://$packageName")) }
                .launchUrl(this, Uri.parse(url))
        } catch (_: Exception) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
    }

    /** Asks the site — from inside the logged-in WebView — for a device token. */
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
                // If the calendar URL is already known, start syncing at once.
                if (!icalUrl.isNullOrBlank()) SyncWorker.syncNow(this)
            }
        }
    }

    /** Exposed to the website as `window.RecallNative`. */
    inner class Bridge {

        /** The website calls this so the calendar URL stays on the phone. */
        @JavascriptInterface
        fun saveCalendarUrl(url: String) {
            if (!url.startsWith("https://")) return
            icalUrl = url
            lifecycleScope.launch { SyncWorker.syncNow(this@MainActivity) }
        }

        @JavascriptInterface
        fun hasCalendarUrl(): Boolean = !icalUrl.isNullOrBlank()

        @JavascriptInterface
        fun syncNow() {
            lifecycleScope.launch { SyncWorker.syncNow(this@MainActivity) }
        }
    }
}
