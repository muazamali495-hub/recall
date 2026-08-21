package pk.edu.uol.recall

object Config {
    /** Where Recall lives. */
    const val RECALL_ORIGIN = "https://recall-kohl-mu.vercel.app"

    /**
     * How often to check Slate, in hours.
     *
     * Android's WorkManager genuinely honours periodic work — unlike iOS,
     * where background refresh is opportunistic and cannot be relied on.
     */
    const val SYNC_INTERVAL_HOURS = 6L
}
