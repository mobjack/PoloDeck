import { CardMarks } from "../components/CardMarks";

export function CommandSheet() {
  return (
    <div className="page command-sheet">
      <header className="page-header page-header--stacked">
        <h1>Scoring commands</h1>
        <p className="command-sheet-lead">
          Type a command in the Scoring command box on the game sheet and press Apply.
          Capital letters are accepted. The line under the box reads the command back
          so you can confirm it before the next entry. A goal, exclusion, penalty,
          timeout, or card records the play and leaves the live clocks where they are.
          The quarter and clock commands below are what start, stop, and reset them.
        </p>
      </header>

      <nav className="command-sheet-toc" aria-label="On this page">
        <a href="#quarters">Quarters</a>
        <a href="#clocks">Clocks</a>
        <a href="#time">Time</a>
        <a href="#teams">Teams</a>
        <a href="#plays">Goals and fouls</a>
        <a href="#timeouts">Timeouts</a>
        <a href="#cards">Cards</a>
        <a href="#examples">Examples</a>
      </nav>

      <section className="command-sheet-section" id="quarters">
        <h2>Quarters and breaks</h2>
        <p>These move the period. The Timer page can start and stop the same clocks.</p>
        <div className="command-sheet-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Command</th>
                <th>What it does</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>sq</code></td>
                <td>
                  Start the period clock. When a break is running, this ends the break and
                  advances to the next period. When a break is waiting after <code>eq</code>,
                  this skips that break and advances.
                </td>
              </tr>
              <tr>
                <td><code>eq</code></td>
                <td>
                  End the period and stop the clocks. The break countdown stays off until{" "}
                  <code>sb</code>. After a tied fourth period, the sheet asks whether to play overtime.
                </td>
              </tr>
              <tr>
                <td>
                  <code>sb</code>
                  <span className="command-sheet-also">startbreak</span>
                </td>
                <td>Start the break or halftime clock. Use this after <code>eq</code> when a break applies.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="command-sheet-section" id="clocks">
        <h2>Game clock and shot clock</h2>
        <div className="command-sheet-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Command</th>
                <th>What it does</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>c</code>
                  <span className="command-sheet-also">clock</span>
                </td>
                <td>Start the game clock when it is stopped, or stop it when it is running.</td>
              </tr>
              <tr>
                <td>
                  <code>r</code>
                  <span className="command-sheet-also">reset</span>
                </td>
                <td>
                  Reset the shot clock to the full shot time for this game. When the game clock
                  is running, the shot clock can resume after the reset.
                </td>
              </tr>
              <tr>
                <td>
                  <code>r20</code>
                  <span className="command-sheet-also">reset20</span>
                </td>
                <td>
                  Reset the shot clock to 20 seconds, for a shot that stays with the offense.
                  Available on game days that use a 20-second reset: USA Water Polo, Olympics,
                  and Junior Olympics.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          After <code>eq</code>, while the break is waiting, <code>c</code> and <code>r</code> wait
          until you enter <code>sb</code>.
        </p>
      </section>

      <section className="command-sheet-section" id="time">
        <h2>Writing a time</h2>
        <p>
          Put the game-clock time at the front of a goal, exclusion, penalty, timeout, or card.
          Leave it off and the current game clock is recorded.
        </p>
        <div className="command-sheet-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Type this</th>
                <th>Recorded time</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>6.07</code> or <code>6:07</code></td>
                <td>6 minutes 7 seconds</td>
              </tr>
              <tr>
                <td><code>6</code> or <code>6.</code></td>
                <td>6 minutes 0 seconds</td>
              </tr>
              <tr>
                <td><code>.03</code></td>
                <td>3 seconds</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          A single digit right before a team letter and cap stays with the play.{" "}
          <code>2b2g</code> is dark cap 2 scoring at the current clock. Write{" "}
          <code>2.00b2g</code> when the time is 2:00.
        </p>
      </section>

      <section className="command-sheet-section" id="teams">
        <h2>Teams</h2>
        <div className="command-sheet-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Letter</th>
                <th>Team</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>b</code> or <code>d</code></td>
                <td>Dark, the home team</td>
              </tr>
              <tr>
                <td><code>w</code> or <code>l</code></td>
                <td>Light, the away team</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="command-sheet-section" id="plays">
        <h2>Goals, exclusions, and penalties</h2>
        <p>A cap number is required. Either order works. A time, when you include one, stays at the front.</p>
        <ul>
          <li>
            Team, cap, action: <code>w13g</code>, <code>6.07w13g</code>, <code>5.53b2e</code>
          </li>
          <li>
            Action, cap, team: <code>g13w</code>, <code>6.07g13w</code>
          </li>
        </ul>
        <div className="command-sheet-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>g</code></td>
                <td>Goal</td>
              </tr>
              <tr>
                <td><code>e</code></td>
                <td>Exclusion</td>
              </tr>
              <tr>
                <td><code>p</code></td>
                <td>Penalty</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="command-sheet-section" id="timeouts">
        <h2>Timeouts</h2>
        <p>
          <code>t</code> is a full timeout. <code>t3</code> is the short timeout. The game day sets
          that length, usually 30 seconds. The team letter comes last. A time at the front is optional.
        </p>
        <div className="command-sheet-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Example</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>tw</code></td>
                <td>Light team, full timeout, current game clock</td>
              </tr>
              <tr>
                <td><code>tb</code></td>
                <td>Dark team, full timeout, current game clock</td>
              </tr>
              <tr>
                <td><code>4.13tw</code></td>
                <td>Light team, full timeout at 4:13</td>
              </tr>
              <tr>
                <td><code>t3w</code></td>
                <td>Light team, short timeout</td>
              </tr>
              <tr>
                <td><code>4.13t3b</code></td>
                <td>Dark team, short timeout at 4:13</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="command-sheet-section" id="cards">
        <h2>Yellow and red cards</h2>
        <p>
          Cards use the same two orders as a goal. <code>r</code> by itself remains the shot-clock
          reset, so a red card is <code>rc</code>. A card records the card the referee showed. It
          does not start an exclusion clock. Enter <code>e</code> as its own command when the
          referee also called an exclusion.
        </p>
        <div className="command-sheet-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Action</th>
                <th>On the sheet</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>yc</code></td>
                <td>
                  Yellow card. One yellow places <CardMarks yellows={1} reds={0} /> beside the name.
                  A second yellow rolls the player and shows <CardMarks yellows={2} reds={0} />.
                </td>
              </tr>
              <tr>
                <td><code>rc</code></td>
                <td>
                  Red card. Rolls the player, shows <CardMarks yellows={0} reds={1} />, and writes
                  misconduct in the next foul column (<code>m1</code> on the game sheet, <code>M/1</code> on
                  the print sheet).
                </td>
              </tr>
              <tr>
                <td><code>yrc</code></td>
                <td>
                  Yellow and red shown together. Head coach only, one per team, at every level.
                  The coach stays. The team line shows <CardMarks yellows={1} reds={1} />.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Coach and bench cards have no cap number. The role letter is <code>h</code> for the head
          coach, <code>a</code> for an assistant, and <code>n</code> for the bench. A red card on a
          coach or the bench strikes that line out. A yellow/red card does not.
        </p>
        <div className="command-sheet-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Example</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>b2yc</code> or <code>yc2b</code></td>
                <td>Yellow card, dark cap 2</td>
              </tr>
              <tr>
                <td><code>w5rc</code> or <code>rc5w</code></td>
                <td>Red card, light cap 5</td>
              </tr>
              <tr>
                <td><code>ychb</code> or <code>bych</code></td>
                <td>Yellow card, dark head coach</td>
              </tr>
              <tr>
                <td><code>rcaw</code> or <code>wrca</code></td>
                <td>Red card, light assistant coach</td>
              </tr>
              <tr>
                <td><code>ycnb</code></td>
                <td>Yellow card, dark bench</td>
              </tr>
              <tr>
                <td><code>yrchb</code> or <code>byrch</code></td>
                <td>Yellow/red card, dark head coach</td>
              </tr>
              <tr>
                <td><code>5.53b2yc</code></td>
                <td>Yellow card, dark cap 2, at 5:53</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          A rolled player, from three personal fouls, a red card, or a second yellow, keeps the
          red row. Another goal, exclusion, or card for that cap is rejected.
        </p>
      </section>

      <section className="command-sheet-section" id="examples">
        <h2>A period, in order</h2>
        <ol className="command-sheet-examples">
          <li><code>sq</code> start the quarter</li>
          <li><code>c</code> start the game clock, if it is not already running</li>
          <li><code>6:50w13g</code> light cap 13 goal at 6:50</li>
          <li><code>r</code> reset the shot clock</li>
          <li><code>5.53b2e</code> dark cap 2 exclusion at 5:53</li>
          <li><code>b2yc</code> yellow card, dark cap 2</li>
          <li><code>tw</code> light full timeout at the current clock</li>
          <li><code>eq</code> end the quarter</li>
          <li><code>sb</code> start the break clock</li>
        </ol>
      </section>
    </div>
  );
}
