package pk.edu.uol.recall

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONTokener
import kotlin.coroutines.resume

/**
 * Fetches the student's Slate calendar feed.
 *
 * Slate sits behind Cloudflare, which serves a JavaScript challenge to
 * anything that isn't a real browser. A plain HTTP client — our server, or
 * iOS Shortcuts — gets the "Just a moment…" page instead of data, because it
 * has no JS engine to solve the challenge with.
 *
 * A WebView is a real browser engine. It loads a Slate page, solves the
 * challenge exactly as Chrome would, and receives the `cf_clearance` cookie.
 * Every request after that is an ordinary same-origin fetch from a cleared
 * page — which is precisely the shape that already works in the browser
 * extension.
 *
 * Note what this does NOT need: the student never signs into Slate here. The
 * calendar URL carries its own token and authenticates itself. The browser is
 * only here to satisfy Cloudflare.
 */
object SlateFetcher {

    private const val SLATE_ORIGIN = "https://slate.uol.edu.pk/"
    private const val MAX_ATTEMPTS = 6
    private const val RETRY_DELAY_MS = 2500L

    class Failure(message: String) : Exception(message)

    suspend fun fetchCalendar(context: Context, icalUrl: String): String =
        suspendCancellableCoroutine { cont ->
            Handler(Looper.getMainLooper()).post {
                // No window, no layout — this WebView exists only to run JS.
                val web = WebView(context.applicationContext)

                web.settings.javaScriptEnabled = true
                web.settings.domStorageEnabled = true

                var finished = false

                fun finish(result: Result<String>) {
                    if (finished) return
                    finished = true
                    web.stopLoading()
                    web.destroy()
                    cont.resume(result.getOrElse { throw it })
                }

                fun fail(message: String) {
                    if (finished) return
                    finished = true
                    web.stopLoading()
                    web.destroy()
                    if (cont.isActive) cont.cancel(Failure(message))
                }

                web.webViewClient = object : WebViewClient() {
                    private var attempt = 0

                    override fun onPageFinished(view: WebView, url: String) {
                        tryFetch(view)
                    }

                    private fun tryFetch(view: WebView) {
                        if (finished) return
                        attempt++

                        if (attempt > MAX_ATTEMPTS) {
                            fail("Cloudflare did not let us through. Open Slate once in your browser and try again.")
                            return
                        }

                        // Same-origin fetch from a page Cloudflare has cleared.
                        val js = """
                            (async () => {
                              try {
                                const r = await fetch(${quote(icalUrl)}, { credentials: 'include', cache: 'no-store' });
                                if (!r.ok) return 'HTTP_' + r.status;
                                return await r.text();
                              } catch (e) {
                                return 'ERR_' + e;
                              }
                            })()
                        """.trimIndent()

                        view.evaluateJavascript(js) { raw ->
                            val text = decode(raw)

                            when {
                                text == null -> retry(view)

                                text.contains("BEGIN:VCALENDAR") -> finish(Result.success(text))

                                // Still on the challenge page, or it bounced us.
                                // Wait and try again — clearance takes a moment.
                                text.startsWith("HTTP_403") || text.startsWith("ERR_") ->
                                    retry(view)

                                text.startsWith("HTTP_") ->
                                    fail("Slate returned ${text.removePrefix("HTTP_")}. Generate a fresh calendar link.")

                                else -> retry(view)
                            }
                        }
                    }

                    private fun retry(view: WebView) {
                        if (finished) return
                        Handler(Looper.getMainLooper()).postDelayed({
                            if (!finished) tryFetch(view)
                        }, RETRY_DELAY_MS)
                    }
                }

                cont.invokeOnCancellation {
                    Handler(Looper.getMainLooper()).post {
                        if (!finished) {
                            finished = true
                            web.stopLoading()
                            web.destroy()
                        }
                    }
                }

                // Load Slate itself first. This is the step that earns the
                // clearance cookie; fetching the feed directly would just hit
                // the challenge with no way to solve it.
                web.loadUrl(SLATE_ORIGIN)
            }
        }

    /** evaluateJavascript hands back a JSON-encoded string, or "null". */
    private fun decode(raw: String?): String? {
        if (raw == null || raw == "null") return null
        return try {
            JSONTokener(raw).nextValue() as? String
        } catch (_: Exception) {
            null
        }
    }

    private fun quote(value: String): String =
        "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
