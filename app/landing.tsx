"use client";

import { useEffect, useRef } from "react";
import { SignInButton } from "./sign-in-button";
import s from "./landing.module.css";

const Mark = ({ size = 30 }: { size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element -- fixed-size brand mark,
  // no layout shift to optimise away, and next/image adds a wrapper the flex
  // brand row does not want.
  <img
    src="/logo.png"
    alt=""
    width={size}
    height={size}
    className={s.mark}
    aria-hidden="true"
  />
);

const Arrow = () => (
  <svg width="32" height="14" viewBox="0 0 32 14" fill="none" className={s.cxn} aria-hidden="true">
    <path d="M0 7h28M24 2l5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Landing() {
  const deckRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  // Cursor tilt on the hero dashboard.
  useEffect(() => {
    const deck = deckRef.current;
    const scene = sceneRef.current;
    if (!deck || !scene) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // A touch screen has no cursor to follow, and setting an inline transform
    // here would override the CSS sway that stands in for it on mobile.
    if (window.matchMedia("(hover: none)").matches) return;

    let raf: number | null = null;
    let tx = 0, ty = 0, cx = 0, cy = 0;

    const tick = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      deck.style.transform = `rotateX(${cy.toFixed(2)}deg) rotateY(${cx.toFixed(2)}deg)`;
      raf = Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : null;
    };

    const onMove = (e: MouseEvent) => {
      const r = scene.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 16;
      ty = -((e.clientY - r.top) / r.height - 0.5) * 13;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const reset = () => {
      tx = 0;
      ty = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    scene.addEventListener("mouseleave", reset);

    // Gentle intro tilt, then settle.
    deck.style.transform = "rotateX(6deg) rotateY(-9deg)";
    const t = setTimeout(reset, 60);

    return () => {
      window.removeEventListener("mousemove", onMove);
      scene.removeEventListener("mouseleave", reset);
      clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Reveal sections as they scroll in.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(`.${s.reveal}`));
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add(s.revealIn));
      return;
    }

    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((x) => {
          if (x.isIntersecting) {
            x.target.classList.add(s.revealIn);
            io.unobserve(x.target);
          }
        }),
      { threshold: 0.15 },
    );

    els.forEach((e, i) => {
      (e as HTMLElement).style.transitionDelay = `${Math.min(i, 4) * 60}ms`;
      io.observe(e);
    });

    return () => io.disconnect();
  }, []);

  return (
    <div className={s.page}>
      <header className={s.nav}>
        <div className={`${s.wrap} ${s.navIn}`}>
          <div className={s.brand}>
            <Mark />
            <span>
              Recall{" "}
              <small>
                for UOL
                {/* Hidden on the narrowest screens, where the nav is already tight. */}
                <span className={s.byline}> · by Muazzam Ali</span>
              </small>
            </span>
          </div>
          <nav className={s.navLinks}>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <a href="#join" className={`${s.btn} ${s.btnPrimary}`}>
            Get started
          </a>
        </div>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className={s.hero}>
          <div className={`${s.wrap} ${s.heroGrid}`}>
            <div>
              <span className={s.eyebrow}>Built for University of Lahore</span>
              <h1>
                Never miss another <em>class, quiz,</em> or deadline.
              </h1>
              <p className={s.lede}>
                Recall reads your Slate calendar and your timetable, then tells
                you exactly what&rsquo;s next — which room, what&rsquo;s due, and
                what to study — before you&rsquo;d ever forget it.
              </p>

              <div className={s.ctaRow}>
                <a href="#join" className={`${s.btn} ${s.btnPrimary}`}>
                  Get started
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
                <a href="#how" className={`${s.btn} ${s.btnGhost}`}>
                  See how it works
                </a>
              </div>

              <div className={s.trust}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1.5l5 2v3.2c0 3.2-2.1 5.7-5 6.8-2.9-1.1-5-3.6-5-6.8V3.5l5-2z" stroke="#57E6C1" strokeWidth="1.3" />
                  <path d="M5.8 8l1.5 1.5L10.4 6" stroke="#57E6C1" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <b>Sign in with Google</b>
                <span className={s.dot} />
                <span>We never see your password</span>
                <span className={s.dot} />
                <span>Read-only &amp; revocable</span>
              </div>
            </div>

            {/* 3D dashboard */}
            <div className={s.scene} ref={sceneRef}>
              <div className={s.deck} ref={deckRef}>
                <div className={s.glow} />
                <div className={`${s.panel} ${s.board}`}>
                  <div className={s.boardHead}>
                    <div>
                      <div className={s.day}>Today · Tuesday</div>
                      <div className={s.sub}>6th semester · BSCS</div>
                    </div>
                    <span className={s.live}>
                      <i /> Synced
                    </span>
                  </div>

                  <div className={s.row}>
                    <div className={s.ic}>
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <rect x="3" y="4" width="14" height="13" rx="2.5" stroke="#57E6C1" strokeWidth="1.5" />
                        <path d="M3 8h14M7 2.5v3M13 2.5v3" stroke="#57E6C1" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className={s.meta}>
                      <div className={s.metaT}>Database Systems</div>
                      <div className={s.metaS}>Now · Room B-204</div>
                    </div>
                    <div className={s.when}>
                      9:00
                      <br />
                      <span className={s.whenFaint}>10:20</span>
                    </div>
                  </div>

                  <div className={s.row}>
                    <div className={`${s.ic} ${s.icAmber}`}>
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <circle cx="10" cy="11" r="6.3" stroke="#FFB65C" strokeWidth="1.5" />
                        <path d="M10 8v3.2l2 1.3M8 2.5h4" stroke="#FFB65C" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className={s.meta}>
                      <div className={s.metaT}>Quiz 2 — Data Structures</div>
                      <div className={s.metaS}>Trees &amp; graph traversal</div>
                    </div>
                    <div className={`${s.when} ${s.whenAmber}`}>
                      <span className={`${s.whenBig} ${s.tnum}`}>2 days</span>
                    </div>
                  </div>

                  <div className={s.row}>
                    <div className={`${s.ic} ${s.icViolet}`}>
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M5 3h7l3 3v11H5z" stroke="#9AA0FF" strokeWidth="1.5" strokeLinejoin="round" />
                        <path d="M12 3v3h3M7.5 11h5M7.5 13.5h5" stroke="#9AA0FF" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className={s.meta}>
                      <div className={s.metaT}>OOP — Assignment 3</div>
                      <div className={s.metaS}>Submit on Slate</div>
                    </div>
                    <div className={s.when}>
                      Thu
                      <br />
                      <span className={s.whenFaint}>11:59 PM</span>
                    </div>
                  </div>
                </div>

                <div className={`${s.chip} ${s.chipPlan} ${s.chipFloat}`} style={{ transform: "translateZ(75px)" }}>
                  <div className={s.ci} style={{ background: "rgba(154,160,255,.14)", border: "1px solid rgba(154,160,255,.3)" }}>
                    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M9 1.6l2 4 4.4.5-3.2 3 1 4.3L9 15.2 4.8 13.4l1-4.3-3.2-3 4.4-.5z" stroke="#9AA0FF" strokeWidth="1.3" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <div className={s.lab}>AI study plan</div>
                    <div className={s.val}>Ready for Quiz 2</div>
                  </div>
                </div>

                <div className={`${s.chip} ${s.chipRemind} ${s.chipFloat} ${s.d2}`} style={{ transform: "translateZ(55px)" }}>
                  <div className={s.ci} style={{ background: "rgba(87,230,193,.14)", border: "1px solid rgba(87,230,193,.3)" }}>
                    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M9 2a4.5 4.5 0 0 0-4.5 4.5c0 3.5-1.3 4.6-1.3 4.6h11.6s-1.3-1.1-1.3-4.6A4.5 4.5 0 0 0 9 2zM7.4 14a1.7 1.7 0 0 0 3.2 0" stroke="#57E6C1" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <div className={s.lab}>Reminder sent</div>
                    <div className={s.val}>Class in 40 min</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={s.band}>
            <div className={`${s.wrap} ${s.pains}`}>
              <span className={s.pain}>
                Timetable buried in a <s>WhatsApp group</s>
              </span>
              <span className={s.pain}>
                Quiz you found out about <s>an hour before</s>
              </span>
              <span className={s.pain}>
                Deadline lost somewhere in <s>Slate</s>
              </span>
              <span className={s.pain}>
                &ldquo;Which room again?&rdquo; <s>every morning</s>
              </span>
            </div>
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section className={s.slab} id="features">
          <div className={s.wrap}>
            <div className={`${s.secHead} ${s.reveal}`}>
              <span className={s.eyebrow}>What Recall does</span>
              <h2>One place for your whole semester — and a tutor that knows your deadlines.</h2>
              <p>
                The organizer keeps you on top of everything automatically. The AI
                doesn&rsquo;t just answer questions — it plans around what&rsquo;s
                actually due.
              </p>
            </div>

            <div className={s.features}>
              <article className={`${s.feat} ${s.reveal}`}>
                <span className={s.edge} />
                <div className={s.fic}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="#57E6C1" strokeWidth="1.6" />
                    <path d="M3.5 9.5h17M8 3v3M16 3v3" stroke="#57E6C1" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M7 13.5l1.6 1.6L12 12" stroke="#57E6C1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3>Smart Organizer</h3>
                <p>
                  Today&rsquo;s classes and room numbers, plus every quiz and
                  assignment deadline — pulled from Slate and your timetable, kept
                  current on their own.
                </p>
                <div className={s.tag}>
                  <b>Reminders</b> before class, before quizzes, before it&rsquo;s due.
                </div>
              </article>

              <article className={`${s.feat} ${s.featAmber} ${s.reveal}`}>
                <span className={s.edge} />
                <div className={s.fic}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 3v3M12 18v3M21 12h-3M6 12H3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7L5.6 5.6" stroke="#FFB65C" strokeWidth="1.6" strokeLinecap="round" />
                    <circle cx="12" cy="12" r="3.4" stroke="#FFB65C" strokeWidth="1.6" />
                  </svg>
                </div>
                <h3>Deadline-aware planner</h3>
                <p>
                  Paste a topic, your slides, or a whole course outline. Recall tells
                  you what matters most for the paper — then builds a study plan that
                  fits the days you&rsquo;re actually free.
                </p>
                <div className={s.tag}>
                  <b>Knows</b> the quiz is Thursday, and you&rsquo;re in class till 3.
                </div>
              </article>

              <article className={`${s.feat} ${s.featViolet} ${s.reveal}`}>
                <span className={s.edge} />
                <div className={s.fic}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 3l2.4 5 5.4.6-4 3.7 1.1 5.3L12 20.1 7.1 22.9l1.1-5.3-4-3.7L9.6 8z" stroke="#9AA0FF" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3>Honest study helper</h3>
                <p>
                  Generate practice quizzes, clear summaries, and worked examples. It
                  teaches you the material and checks your draft — a real tutor, not a
                  way to hand in work that isn&rsquo;t yours.
                </p>
                <div className={s.tag}>
                  <b>Makes you ready</b> for the exam, not dependent on it.
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ---------- How ---------- */}
        <section
          className={s.slab}
          id="how"
          style={{ background: "linear-gradient(180deg,transparent,rgba(87,230,193,.03),transparent)" }}
        >
          <div className={s.wrap}>
            <div className={`${s.secHead} ${s.reveal}`}>
              <span className={s.eyebrow}>Set up once, all semester</span>
              <h2>Two minutes now. Never scramble again.</h2>
            </div>
            <div className={s.steps}>
              <div className={`${s.step} ${s.reveal}`}>
                <div className={s.n}>1</div>
                <h3>Sign in with Google</h3>
                <p>
                  Use your UOL Google account — the same one you already use for
                  Slate. No new password, nothing to remember.
                </p>
                <Arrow />
              </div>
              <div className={`${s.step} ${s.reveal}`}>
                <div className={s.n}>2</div>
                <h3>Connect &amp; snap</h3>
                <p>
                  Link Slate once, and upload your timetable — PDF, screenshot or
                  photo. Recall reads it and sets everything up.
                </p>
                <Arrow />
              </div>
              <div className={`${s.step} ${s.reveal}`}>
                <div className={s.n}>3</div>
                <h3>Get on with it</h3>
                <p>
                  Open Recall any day to see what&rsquo;s next and what&rsquo;s due —
                  and get a nudge before each class, quiz, and deadline.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Privacy ---------- */}
        <section className={s.slab} id="privacy">
          <div className={s.wrap}>
            <div className={`${s.privacy} ${s.reveal}`}>
              <div>
                <span className={s.eyebrow}>Why it&rsquo;s safe</span>
                <h2>Your password never leaves your hands.</h2>
                <p>
                  Most &ldquo;student helpers&rdquo; ask for your portal login and
                  store it. Recall doesn&rsquo;t — and it can&rsquo;t, by design. We
                  connect through a read-only calendar link you can switch off
                  anytime.
                </p>
                <p style={{ color: "var(--faint)", fontSize: ".9rem" }}>
                  This is the difference between a tool your university could
                  recommend and one it would ban.
                </p>
              </div>
              <div className={s.vault}>
                <div className={s.vrow}>
                  <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                    <rect x="4" y="9.5" width="14" height="9" rx="2.2" stroke="#57E6C1" strokeWidth="1.5" />
                    <path d="M7 9.5V7a4 4 0 0 1 8 0v2.5" stroke="#57E6C1" strokeWidth="1.5" />
                    <circle cx="11" cy="13.5" r="1.4" fill="#57E6C1" />
                  </svg>
                  <div>
                    <div className={s.vt}>No portal password, ever</div>
                    <div className={s.vs}>You sign in with Google. We never receive or store it.</div>
                  </div>
                </div>
                <div className={s.vrow}>
                  <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                    <path d="M11 3l7 2.6v4.6c0 4.4-3 7.9-7 9.2-4-1.3-7-4.8-7-9.2V5.6L11 3z" stroke="#57E6C1" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M8 11l2 2 4-4.5" stroke="#57E6C1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div>
                    <div className={s.vt}>Read-only &amp; revocable</div>
                    <div className={s.vs}>We can see deadlines, never change your grades or submit anything.</div>
                  </div>
                </div>
                <div className={s.vrow}>
                  <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                    <rect x="3.5" y="3.5" width="15" height="15" rx="3.5" stroke="#57E6C1" strokeWidth="1.5" />
                    <path d="M7 11l2.5 2.5L15 8" stroke="#57E6C1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div>
                    <div className={s.vt}>Isolated per student</div>
                    <div className={s.vs}>
                      Your data is locked to your account at the database level — no
                      one else can reach it.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Sign in ---------- */}
        <section className={s.final} id="join">
          <div className={s.wrap}>
            <h2 className={s.reveal}>Start with your UOL account.</h2>
            <p className={s.reveal}>
              Sign in with the Google account you already use for Slate. It takes
              about two minutes to set up, and it&rsquo;s free.
            </p>
            <div className={s.reveal} style={{ maxWidth: 340, margin: "0 auto" }}>
              <SignInButton />
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={`${s.wrap} ${s.footIn}`}>
          <div className={s.brand} style={{ fontSize: "1rem" }}>
            <Mark size={24} />
            <span>Recall</span>
          </div>
          <span>
            Made by{" "}
            <a
              href="https://github.com/muazamali495-hub"
              target="_blank"
              rel="noopener noreferrer"
              className={s.author}
            >
              Muazzam Ali
            </a>{" "}
            — a UOL student, for UOL students · <span className={s.tnum}>2026</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
