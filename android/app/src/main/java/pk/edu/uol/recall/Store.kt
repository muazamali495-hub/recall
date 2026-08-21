package pk.edu.uol.recall

import android.content.Context

/**
 * Local settings.
 *
 * The calendar URL never leaves the phone — Recall's server only ever receives
 * the calendar's contents, never the link that fetches it. Same promise the
 * browser extension makes.
 */
object Store {
    private const val FILE = "recall"
    private const val KEY_TOKEN = "device_token"
    private const val KEY_ICAL = "ical_url"
    private const val KEY_LAST_SYNC = "last_sync"
    private const val KEY_LAST_ERROR = "last_error"

    private fun prefs(c: Context) = c.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    var Context.deviceToken: String?
        get() = prefs(this).getString(KEY_TOKEN, null)
        set(v) { prefs(this).edit().putString(KEY_TOKEN, v).apply() }

    var Context.icalUrl: String?
        get() = prefs(this).getString(KEY_ICAL, null)
        set(v) { prefs(this).edit().putString(KEY_ICAL, v).apply() }

    var Context.lastSync: Long
        get() = prefs(this).getLong(KEY_LAST_SYNC, 0L)
        set(v) { prefs(this).edit().putLong(KEY_LAST_SYNC, v).apply() }

    var Context.lastError: String?
        get() = prefs(this).getString(KEY_LAST_ERROR, null)
        set(v) { prefs(this).edit().putString(KEY_LAST_ERROR, v).apply() }

    fun clear(c: Context) = prefs(c).edit().clear().apply()
}
