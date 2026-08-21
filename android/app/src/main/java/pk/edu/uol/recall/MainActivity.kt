package pk.edu.uol.recall

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.work.WorkInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import pk.edu.uol.recall.Store.deviceToken
import pk.edu.uol.recall.Store.icalUrl
import pk.edu.uol.recall.Store.lastError
import java.net.HttpURLConnection
import java.net.URL

/**
 * Two screens in one.
 *
 * Once the phone is linked and knows the calendar URL, it just shows Recall's
 * website — no point rebuilding a dashboard that already exists and stays in
 * step with the web app. The setup screen only appears when something is
 * missing.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var setup: View
    private lateinit var status: TextView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        setup = findViewById(R.id.setup)
        status = findViewById(R.id.status)

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = WebViewClient()

        findViewById<Button>(R.id.pairButton).setOnClickListener { pair() }
        findViewById<Button>(R.id.saveUrlButton).setOnClickListener { saveIcalUrl() }
        findViewById<Button>(R.id.syncButton).setOnClickListener { syncNow() }

        SyncWorker.schedule(this)
        render()
    }

    private fun isReady() = !deviceToken.isNullOrBlank() && !icalUrl.isNullOrBlank()

    private fun render() {
        if (isReady()) {
            setup.visibility = View.GONE
            web.visibility = View.VISIBLE
            if (web.url == null) web.loadUrl("${Config.RECALL_ORIGIN}/dashboard")
        } else {
            setup.visibility = View.VISIBLE
            web.visibility = View.GONE

            findViewById<View>(R.id.pairRow).visibility =
                if (deviceToken.isNullOrBlank()) View.VISIBLE else View.GONE
            findViewById<View>(R.id.urlRow).visibility =
                if (deviceToken.isNullOrBlank()) View.GONE else View.VISIBLE
        }
    }

    /** Exchanges the code shown on the Recall website for a device token. */
    private fun pair() {
        val code = findViewById<EditText>(R.id.codeInput).text.toString().trim()
        if (code.isEmpty()) {
            status.text = getString(R.string.enter_code)
            return
        }

        status.text = getString(R.string.linking)

        lifecycleScope.launch {
            try {
                val token = withContext(Dispatchers.IO) { requestToken(code) }
                deviceToken = token
                status.text = getString(R.string.linked)
                render()
            } catch (e: Exception) {
                status.text = e.message ?: getString(R.string.could_not_link)
            }
        }
    }

    private fun requestToken(code: String): String {
        val conn = (URL("${Config.RECALL_ORIGIN}/api/pair").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
            connectTimeout = 20_000
            readTimeout = 30_000
        }

        try {
            val body = JSONObject()
                .put("code", code)
                .put("label", "Android phone")
                .toString()

            conn.outputStream.use { it.write(body.toByteArray()) }

            val ok = conn.responseCode in 200..299
            val text = (if (ok) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""

            val json = JSONObject(text.ifBlank { "{}" })

            if (!ok) throw Exception(json.optString("error", "That code did not work."))

            return json.optString("token").ifBlank { throw Exception("No token returned.") }
        } finally {
            conn.disconnect()
        }
    }

    private fun saveIcalUrl() {
        val url = findViewById<EditText>(R.id.urlInput).text.toString().trim()

        if (!url.startsWith("https://")) {
            status.text = getString(R.string.url_must_be_https)
            return
        }

        icalUrl = url
        status.text = getString(R.string.saved_syncing)
        syncNow()
        render()
    }

    private fun syncNow() {
        status.text = getString(R.string.checking_slate)

        SyncWorker.syncNow(this).observe(this) { info ->
            when (info?.state) {
                WorkInfo.State.SUCCEEDED -> {
                    val n = info.outputData.getInt("synced", 0)
                    status.text = getString(R.string.synced_events, n)
                    if (web.visibility == View.VISIBLE) web.reload()
                }
                WorkInfo.State.FAILED ->
                    status.text = lastError ?: getString(R.string.sync_failed)
                else -> Unit
            }
        }
    }


    override fun onBackPressed() {
        if (web.visibility == View.VISIBLE && web.canGoBack()) web.goBack()
        else @Suppress("DEPRECATION") super.onBackPressed()
    }
}
