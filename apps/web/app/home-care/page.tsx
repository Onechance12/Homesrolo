import Link from 'next/link'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { HOMEOWNER_SIGNIN_URL } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'Home care that is easier to keep up with',
  description: 'A practical whole-home care guide for seasonal checks, HVAC, plumbing, electrical, roof, exterior, appliances, safety, yard, pool, and pest control.',
  canonical: '/home-care/',
})

const SEASONAL_ROUNDS = [
  {
    season: 'Spring',
    focus: 'Water, weather, and the outside of the house',
    items: ['Walk the drainage path after rain', 'Look for winter movement, gaps, and peeling finishes', 'Check cooling equipment before the first hard-working week', 'Repeat exterior photos from the same views'],
  },
  {
    season: 'Summer',
    focus: 'Cooling, irrigation, pests, and storm follow-up',
    items: ['Notice rooms that cool differently', 'Watch for slow irrigation leaks and standing water', 'Check door sweeps, screens, and common pest entry points', 'Record storm observations before repairs erase the starting condition'],
  },
  {
    season: 'Fall',
    focus: 'Heating, drainage, and colder-weather preparation',
    items: ['Review heating service and filter needs', 'Clear visible drainage paths and downspout exits', 'Know where the main water shutoff is before a freeze', 'Check alarms and follow each manufacturer’s replacement guidance'],
  },
  {
    season: 'Winter',
    focus: 'Freeze protection, interior moisture, and planning',
    items: ['Protect exposed plumbing for local conditions', 'Watch windows, attics, and closets for unusual condensation', 'Review the year’s repairs and unfinished items', 'Choose the next project before an urgent problem chooses it for you'],
  },
] as const

const CARE_SYSTEMS = [
  {
    id: 'heating-cooling',
    title: 'Heating & cooling',
    intro: 'Comfort problems are easier to understand when the equipment, filter, service history, and exact symptom are written down.',
    checks: ['Check the filter often enough to learn how quickly your own home loads it', 'Keep supply and return openings clear', 'Notice new sounds, odors, short cycling, water near equipment, or rooms that drift from the rest', 'Record the indoor and outdoor equipment model numbers together'],
    record: 'Filter dimensions and type, equipment models, installation year if known, service company, service dates, parts replaced, and warranty location.',
    stop: 'Stop and call the right professional for gas odors, burning smells, refrigerant work, exposed wiring, repeated breaker trips, or water reaching electrical equipment.',
  },
  {
    id: 'plumbing',
    title: 'Plumbing & water',
    intro: 'A small leak can become a cabinet, floor, or wall problem. The useful habit is knowing where water can be stopped and checking the quiet places.',
    checks: ['Locate and label the main water shutoff', 'Look below sinks and around toilets, tubs, appliances, and the water-heater pan', 'Check accessible supply hoses for corrosion, bulging, or active moisture', 'Pay attention to unexplained meter movement, pressure changes, or a water bill that breaks its normal pattern'],
    record: 'Shutoff locations, water-heater model and installation date, softener or filter details, past leaks, repair locations, plumber, and any material or pressure information supplied.',
    stop: 'Active flooding, sewage, a leaking gas-fired appliance, scalding risk, or water near energized equipment is not a casual do-it-yourself inspection.',
  },
  {
    id: 'electrical',
    title: 'Electrical',
    intro: 'The homeowner record should make the system easier to identify without encouraging anyone to work inside energized equipment.',
    checks: ['Keep the electrical panel accessible and its circuit labels readable', 'Use built-in test controls only as the device manufacturer directs', 'Notice warm devices, discoloration, buzzing, flicker, damaged cords, or outlets that stop holding a plug', 'Keep the model and replacement date for smoke and carbon-monoxide alarms'],
    record: 'Panel location, main rating when documented by a professional, circuit schedule, major electrical work, permits when applicable, electricians, alarm models, and service dates.',
    stop: 'Do not remove a panel cover or work on live wiring. Heat, smoke, arcing, repeated trips, shock, or storm-damaged service equipment needs urgent professional attention.',
  },
  {
    id: 'roof-gutters',
    title: 'Roof & gutters',
    intro: 'The best routine roof check starts on the ground and inside the house. A homeowner does not need to climb onto a roof to keep a useful record.',
    checks: ['Repeat clear ground-level photos of each elevation', 'Look inside for new stains, damp insulation, or daylight where it should not appear', 'Watch where downspouts discharge and whether water moves away from the foundation', 'After severe weather, record the date and visible observations before drawing conclusions'],
    record: 'Installation year, exact product if known, color, prior repairs, inspection reports, contractor, permit or inspection record, photographs, and warranty location.',
    stop: 'Stay off wet, steep, hot, icy, damaged, or unfamiliar roofs. Active leaks near electrical fixtures, structural movement, or storm damage call for safe temporary protection and qualified help.',
  },
  {
    id: 'exterior',
    title: 'Exterior, windows & drainage',
    intro: 'The outside of the house is one connected water-management system: roof edges, walls, openings, grade, drains, and the places where materials meet.',
    checks: ['Look for gaps, failed sealant, loose trim, peeling finish, and damaged screens', 'Watch for soil or mulch bridging clearances around siding and weep openings', 'Check that surface water moves away instead of collecting against the house', 'Compare the same window, door, wall, and foundation views over time'],
    record: 'Paint and finish names, window and door brands, exterior repairs, drainage changes, service companies, product care instructions, and photographs.',
    stop: 'Large cracks, rapid movement, unsafe ladders, suspected structural problems, or water entering concealed assemblies deserve a qualified evaluation.',
  },
  {
    id: 'yard-pool-pest',
    title: 'Yard, pool & pest control',
    intro: 'The property outside the walls affects drainage, foundations, equipment access, pests, and the people and animals using the home.',
    checks: ['Keep plants and stored items from blocking equipment, vents, drains, and service access', 'Record irrigation zones and watch for leaks or overspray against the house', 'Track recurring pest location and timing instead of treating every sighting as unrelated', 'Follow the pool-equipment and chemical manufacturers’ instructions rather than guessing from appearance'],
    record: 'Irrigation layout, pool equipment models, treatment products, service schedule, recurring pest areas, tree work, warranties, and contractor contacts.',
    stop: 'Electrical equipment near water, unstable trees, wildlife, concentrated chemicals, or a suspected hazardous infestation needs appropriate professional help.',
  },
  {
    id: 'home-safety',
    title: 'Home safety',
    intro: 'The most useful safety information is simple enough to find under pressure and familiar enough that the household has already discussed it.',
    checks: ['Know the water, electrical, and fuel shutoff locations that apply to the home', 'Keep exits, utility equipment, and emergency controls accessible', 'Follow manufacturer instructions for alarm testing, cleaning, replacement, and battery type', 'Write down the home address, gate details, household needs, pets, and emergency contacts where the household can find them'],
    record: 'Alarm models and dates, extinguisher locations and instructions, shutoff locations, emergency contacts, accessibility needs, pet information, and completed safety work.',
    stop: 'Fire, gas odor, carbon-monoxide alarm, electrical arcing, structural instability, or immediate danger comes before the record. Leave the area and contact emergency services or the appropriate utility when needed.',
  },
] as const

export default function HomeCarePage() {
  return (
    <>
      <section className="hub-hero">
        <div className="shell hub-hero__layout">
          <div>
            <p className="eyebrow">Whole-home care</p>
            <h1>A house runs better when the small things have a rhythm.</h1>
            <p className="hub-hero__lede">
              Home care is not a perfect checklist taped to the refrigerator. It is a short, repeatable walk through
              the places that matter, a record of what changed, and a clear line between a safe homeowner check and
              work that needs the right professional.
            </p>
            <div className="hub-hero__actions">
              <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>Open my home</a>
              <Link className="btn btn--night" href="/home-record/">Build the home record</Link>
            </div>
          </div>
          <aside className="hub-hero__aside" aria-label="A simple home care rhythm">
            <strong>One useful rhythm</strong>
            <ol>
              <li><span>01</span> Walk the same route</li>
              <li><span>02</span> Notice what changed</li>
              <li><span>03</span> Photograph the same views</li>
              <li><span>04</span> Record service and repairs</li>
              <li><span>05</span> Choose the next action</li>
            </ol>
          </aside>
        </div>
      </section>

      <nav className="hub-jump" aria-label="Home care topics">
        <div className="shell">
          <a href="#seasonal-rounds">Seasonal rounds</a>
          <a href="#heating-cooling">Heating & cooling</a>
          <a href="#plumbing">Plumbing</a>
          <a href="#electrical">Electrical</a>
          <a href="#roof-gutters">Roof & gutters</a>
          <a href="#exterior">Exterior</a>
          <a href="#yard-pool-pest">Yard, pool & pest</a>
          <a href="#home-safety">Safety</a>
        </div>
      </nav>

      <section id="seasonal-rounds" className="section hub-section" aria-labelledby="seasonal-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Four calm passes</p>
            <h2 id="seasonal-heading">Use the season as a reminder, not a deadline.</h2>
            <p>
              Climate, equipment, trees, occupancy, and the age of the house change the schedule. These rounds are a
              way to notice patterns; the instructions for the actual product or system still control its care.
            </p>
          </div>
          <div className="hub-card-grid hub-card-grid--four" style={{ marginTop: '2.5rem' }}>
            {SEASONAL_ROUNDS.map(round => (
              <article key={round.season} className="hub-card">
                <p className="hub-card__label">{round.season}</p>
                <h3>{round.focus}</h3>
                <ul>{round.items.map(item => <li key={item}>{item}</li>)}</ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--sunken hub-section" aria-labelledby="systems-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Room by room, system by system</p>
            <h2 id="systems-heading">Know what to look at, what to remember, and when to stop.</h2>
            <p>No single schedule fits every house. These are starting points for a more useful conversation with the people who service yours.</p>
          </div>
          <div className="hub-system-list">
            {CARE_SYSTEMS.map(system => (
              <article id={system.id} key={system.id} className="hub-system">
                <div className="hub-system__intro">
                  <h3>{system.title}</h3>
                  <p>{system.intro}</p>
                </div>
                <div>
                  <h4>Look and listen</h4>
                  <ul>{system.checks.map(check => <li key={check}>{check}</li>)}</ul>
                </div>
                <div>
                  <h4>Keep with the home</h4>
                  <p>{system.record}</p>
                  <p className="hub-stop"><strong>Safety line:</strong> {system.stop}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="care-record-heading">
        <div className="shell hub-split">
          <div className="section-heading">
            <p className="eyebrow">Make the next visit easier</p>
            <h2 id="care-record-heading">A service date is more useful with the reason and result.</h2>
            <p>
              “AC serviced” says almost nothing a year later. Keep the equipment, symptom, observations, work
              performed, part or setting changed, person who did it, and the next recommended check. Unknown is still
              better than an invented answer.
            </p>
          </div>
          <aside className="hub-note">
            <p className="hub-card__label">Start with six lines</p>
            <ol>
              <li>What part of the home?</li>
              <li>What did you notice?</li>
              <li>When did it begin?</li>
              <li>What was checked or changed?</li>
              <li>Who performed the work?</li>
              <li>What should happen next?</li>
            </ol>
          </aside>
        </div>
      </section>

      <section className="home-final">
        <div className="shell home-final__inner">
          <div>
            <p className="eyebrow">Your house, your rhythm</p>
            <h2>Start with one system you use every day.</h2>
            <p>Record the last service you remember or open a project for the next thing that needs attention.</p>
          </div>
          <div className="home-final__actions">
            <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>Open my home</a>
            <Link className="btn btn--night" href="/guides/">Use the homeowner guides</Link>
          </div>
        </div>
      </section>
    </>
  )
}
