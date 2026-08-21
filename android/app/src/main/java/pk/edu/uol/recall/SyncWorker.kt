package pk.edu.uol.recall

import android.content.Context
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import pk.edu.uol.recall.Store.deviceToken
import pk.edu.uol.recall.Store.icalUrl
import pk.edu.uol.recall.Store.lastError
import pk.edu.uol.recall.Store.lastSync
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Pulls the Slate calendar and hands the contents to Recall.
 *
 * This is the whole reason the Android app exists. Everything else Recall does
 * works fine in a browser; only this step needs a real browser engine on the
 * student's own device, because Cloudflare refuses servers.
 */
class SyncWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val token = applicationContext.deviceToken
        val ical = applicationContext.icalUrl

        if (token.isNullOrBlank() || ical.isNullOrBlank()) {
            // Not set up yet. Not a failure — nothing to do.
            return Result.success()
        }

        return try {
            val ics = SlateFetcher.fetchCalendar(applicationContext, ical)
            val count = upload(token, ics)

            applicationContext.lastSync = System.currentTimeMillis()
            applicationContext.lastError = null

            Result.success(workDataOf("synced" to count))
        } catch (e: Exception) {
            applicationContext.lastError = e.message ?: "Sync failed"

            // Retry with backoff — a transient Cloudflare or network blip
            // should not mean waiting six hours for the next attempt.
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    /** POSTs the raw calendar to Recall, which parses and stores it. */
    private suspend fun upload(token: String, ics: String): Int = withContext(Dispatchers.IO) {
        val conn = (URL("${Config.RECALL_ORIGIN}/api/sync").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Content-Type", "text/calendar")
            doOutput = true
            connectTimeout = 20_000
            readTimeout = 60_000
        }

        try {
            conn.outputStream.use { it.write(ics.toByteArray()) }

            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""

            if (code !in 200..299) {
                throw SlateFetcher.Failure(
                    if (code == 401) "This device is not linked to Recall. Pair it again."
                    else "Recall rejected the sync (HTTP $code)."
                )
            }

            Regex("\"parsed\"\\s*:\\s*(\\d+)").find(body)?.groupValues?.get(1)?.toIntOrNull() ?: 0
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        private const val PERIODIC = "recall-sync"
        private const val ONE_OFF = "recall-sync-now"

        /** Schedules the recurring sync. Safe to call on every launch. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(
                Config.SYNC_INTERVAL_HOURS, TimeUnit.HOURS,
            )
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC,
                // KEEP, so reopening the app doesn't reset the clock and
                // postpone the next sync indefinitely.
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        /** Runs a sync immediately — used by the "Sync now" button. */
        fun syncNow(context: Context): androidx.lifecycle.LiveData<WorkInfo?> {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .build()

            val wm = WorkManager.getInstance(context)
            wm.enqueueUniqueWork(ONE_OFF, ExistingWorkPolicy.REPLACE, request)

            return wm.getWorkInfoByIdLiveData(request.id)
        }
    }
}
