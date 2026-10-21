# GPS hardware — provisional selection

**Status: PROVISIONAL. Not adopted. No hardware purchased, no accounts created, nothing built.**

Candidate: **Mictrack MT710** (Cat‑M1 / NB‑IoT pet tracker).

This record exists so the choice can be checked rather than trusted. Every claim below is graded:

| Grade           | Meaning                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| **Confirmed**   | Stated by the vendor or the project's own documentation, cited below.           |
| **Evidenced**   | Credible third-party reporting, but not a primary source.                       |
| **Unconfirmed** | Plausible and widely assumed, but _not established_. Treat as an open question. |

The single most important line in this document is in [§3](#3-safaricom-kenya-nb-iot): **whether Safaricom
sells NB‑IoT connectivity we can actually buy, and on which band, is Unconfirmed.** Everything else
is downstream of that.

---

## 1. Technical requirements

**Confirmed**, from Mictrack's product page:

|                       |                                                                               |
| --------------------- | ----------------------------------------------------------------------------- |
| Weight                | 35 g                                                                          |
| Dimensions            | 46 × 41 × 16 mm                                                               |
| Ingress protection    | IP68                                                                          |
| Battery               | 650 mAh Li‑polymer                                                            |
| Battery life          | Up to 1 year at 1 report/day (deep sleep); 3–7 days in active motion tracking |
| Positioning           | GPS + LBS + Wi‑Fi                                                             |
| Operating temperature | −20 °C to +70 °C                                                              |
| Transport             | Open protocol over TCP/UDP, reporting to your own server                      |

Two of these deserve emphasis because they shape the product, not just the bill of materials.

**The battery figure is a range spanning two orders of magnitude.** One report per day is a _lost-pet
recovery_ device. Three to seven days is a _live tracking_ device. Which one we are building is a
product decision that has not been made, and it determines charging cadence, reporting interval,
and what the app can honestly promise. It also interacts directly with the still-deferred
live-tracking freshness threshold — a device reporting daily can never satisfy a 30-second
freshness rule.

**Wi‑Fi is a positioning source, not a data path.** The device does not upload over Wi‑Fi; it uses
nearby access points to improve a fix where GNSS is poor. Cellular remains the only route for data.

---

## 2. Cellular modes and bands

**Confirmed**, from the vendor:

- **LTE‑M (Cat‑M1)** and **NB‑IoT (Cat‑NB1)**: B1, B2, B3, B4, B5, B8, B12, B13, B18, B19, B20, B26, B28
- **GSM fallback**: 850 / 900 / 1800 / 1900 MHz

So the device supports **B20 (800 MHz)** on both LTE‑M and NB‑IoT. That half of the compatibility
question is settled.

A GSM fallback exists, which is a genuine safety net — but it is a _2G_ fallback, and 2G sunset
timelines are a live risk in many markets. Relying on it long-term would be trading one unconfirmed
dependency for another.

---

## 3. Safaricom Kenya NB‑IoT

This is where the provisional case is weakest, and it should not be papered over.

**Confirmed:** Safaricom deployed LTE on **B20 (800 MHz)** and B3 (1800 MHz), from its 4G launch in
2014 onward, with wide population coverage.

**Evidenced:** Safaricom has real NB‑IoT in commercial use — most concretely a prepaid LPG service
with M‑Gas using NB‑IoT smart meters integrated with M‑PESA. NB‑IoT is therefore not hypothetical on
this network.

**Unconfirmed, and material:**

1. **Which band Safaricom's NB‑IoT actually runs on.** That Safaricom uses B20 for LTE broadband
   does _not_ establish that its NB‑IoT carrier is on B20. These are separate deployments. The
   device supporting B20 and the operator using B20 for a different service is not a match.
2. **Whether NB‑IoT connectivity is purchasable by a small third party.** The visible deployments
   are large partner integrations. An M‑Gas smart-meter programme does not imply an off-the-shelf
   NB‑IoT SIM with an APN we can put in a pet collar.
3. **Coverage footprint for NB‑IoT specifically**, which is not the same as Safaricom's 97 % 4G
   population coverage.
4. **Whether LTE‑M is deployed at all.** The MT710 supports both; if Safaricom runs only NB‑IoT, the
   device's LTE‑M capability is irrelevant here.

> **The reasoning "device supports B20, Safaricom uses B20, therefore compatible" does not hold.**
> It conflates band support with service availability. Resolving this needs an answer from
> Safaricom's IoT/M2M business team about NB‑IoT (and LTE‑M) availability, bands, APN, and SIM
> provisioning for a small customer — not further desk research.

---

## 4. Traccar integration

**Confirmed**, from Mictrack's own platform documentation:

- The MT710 is supported by Traccar on **TCP/UDP port 5030**, the **`tlt2h`** protocol handler.
- Mictrack lists Traccar alongside Gurtam, Flespi, Navixy, GPS‑Server, GPSWOX, GpsGate and GPS‑trace.

**Confirmed**, from Traccar's repository: `tlt2h` was **TCP‑only** until UDP support was merged in
June 2024 (PR #5344), verified by the contributor against a Mictrack MT700, with a follow-up fix to
datagram detection and Wi‑Fi handling (PR #5379).

That merge matters more than it looks. The original request noted TCP costs roughly **twice the
billable data** of UDP for payloads this small, because of handshake and teardown overhead. On a
metered NB‑IoT plan, and on a battery where every radio second counts, that is the difference
between the 1‑year and the 3‑day end of §1's battery range.

**Two things to check before relying on it:** that the Traccar version we deploy actually contains
the UDP change (it is post‑June‑2024 master, so an older pinned release will not have it), and
whether Safaricom's NB‑IoT bearer tolerates sustained TCP at all — some NB‑IoT deployments are
tuned for UDP/CoAP and handle long-lived TCP poorly.

Configuration is by SMS, USB config tool, or cloud, using vendor commands of the form
`803,<apn>,,` for APN, `804,<host>,<port>` for the server, `NWM,...` for network mode, then
`REBOOT`. Exact values are device- and network-specific and should come from the vendor, not from
this document.

---

## 5. Device identity and IMEI

Traccar identifies a device by a **device ID** that must be registered in Traccar before its
reports are accepted; for Mictrack devices this is the module identifier, conventionally the IMEI.
An unregistered device shows up as _unknown device_ and its data is discarded — a documented,
commonly-hit failure mode.

**Nothing about this changes our schema.** The existing `trackers.serial_number` column is `text`,
4–64 characters, uppercase, globally unique — an IMEI fits without modification, and
`trackers_serial_number_key` already enforces one device to one account.

**No columns are being added.** In particular, no IMEI-specific column, no ICCID, no MSISDN, and no
per-fix battery, heading or altitude. The hardware may expose such values; until a shipped feature
reads them, a column for each is a column that arrives null forever. That was the standing rule in
Phase 12 and it does not change because a candidate device has been named.

An open question for the ingestion phase, not this one: an IMEI presented over a plain TCP/UDP
socket is an _assertion of identity, not proof of it_. Anything that can reach the port can claim
any IMEI. How ingestion authenticates a device — allow-listing, a shared secret, private APN, or
network-level restriction — is a security decision that must be made before any port is opened.

---

## 6. Expected payload flow

```
MT710  ──cellular (NB-IoT / LTE-M / 2G fallback)──▶  ingestion service   [DOES NOT EXIST]
                                                            │ validates, authenticates the device
                                                            │ holds the privileged key
                                                            ▼
                                                     pet_locations  (INSERT)
                                                            │
                                                            ▼  RLS: owner + effective caregivers
                                                     the app reads latest / history
```

Everything to the right of the ingestion box is **built and tested**: `pet_locations`, the ordering
by `recorded_at`, the read policies, the adapters, and `RecordLocationInput` — which is already the
provider-neutral shape a Mictrack decoder would translate _into_. Naming a candidate device does not
change it, which is the point of having built it provider-neutrally.

The ingestion box is **not built**, and the rule it exists to enforce is unchanged: `pet_locations`
has no INSERT policy and never will for clients. A client that can write its own pet's position can
forge a safe-zone breach, and every alert downstream inherits the lie.

**Not yet verified:** the exact `tlt2h` payload fields. Mictrack's protocol PDF for the MT710 is
published but is not machine-readable text, so the field-level format has **not** been confirmed
first-hand. Do not design a decoder from this document; read the protocol PDF directly, or observe
real packets, before writing one.

---

## 7. What must be physically tested before adoption

No amount of further reading substitutes for these. In dependency order — each one can end the
evaluation:

1. **Can we buy Safaricom NB‑IoT (or LTE‑M) connectivity at all?** Speak to Safaricom IoT/M2M.
   Establish: technology, band, APN, SIM provisioning for a small customer, and per-device cost.
   _If the answer is no, the rest is moot and the fallbacks in §8 apply._
2. **Does one device attach to the network** at the intended location, on the stated band?
3. **Does it reach a Traccar instance** on 5030 and appear as a registered device rather than
   _unknown_?
4. **Does UDP work end to end** on that bearer, on a Traccar build containing PR #5344 — and what is
   the measured data volume per report, TCP versus UDP?
5. **Real battery life at our intended reporting interval**, measured, not quoted — the honest
   version of §1's range for the cadence we actually choose.
6. **Positioning quality on an animal**: fix acquisition time, accuracy on a moving collar, and how
   often accuracy exceeds the existing 500 m usability ceiling.
7. **Buffered upload behaviour** after a coverage gap — does it backfill with true `recorded_at`
   values? Our schema and ordering already assume it does; that assumption needs proving.
8. **Physical suitability**: 35 g and IP68 on an actual animal, retention, and the collar mount.

---

## 8. Risks and fallbacks

| Risk                                             | Severity             | Mitigation / fallback                                                                                                                           |
| ------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Safaricom NB‑IoT not purchasable by us           | **Blocking**         | LTE‑M if deployed; roaming/MVNO IoT SIM (Onomondo and similar advertise Kenya multi-network M2M); 2G fallback as a stopgap                      |
| NB‑IoT deployed on a band the device lacks       | **Blocking**         | Device covers 13 bands; re-check against the operator's actual carrier before buying                                                            |
| 2G sunset removes the GSM fallback               | Medium               | Do not architect around 2G; treat it as bridging only                                                                                           |
| TCP-only Traccar build, or bearer hostile to TCP | Medium               | Use a Traccar build with PR #5344; confirm UDP on the real bearer in test 4                                                                     |
| Battery far short of expectations at our cadence | Medium               | Product choice between daily-report recovery and live tracking; measure in test 5                                                               |
| Single-vendor dependency on Mictrack             | Low–Medium           | The `tlt2h` handler is open and Traccar supports many vendors; our ingestion boundary is provider-neutral, so swapping the decoder is contained |
| Spoofed IMEI at the ingestion port               | **High, unresolved** | Must be designed before any port opens — see §5                                                                                                 |

**Fallbacks worth keeping alive:** other Traccar-supported LTE‑M/NB‑IoT trackers on the same
protocol family; a roaming IoT MVNO SIM instead of a direct Safaricom relationship; and, if
cellular IoT proves impractical in this market, revisiting the product's positioning rather than
forcing the hardware.

---

## What this record does not decide

Deliberately unresolved, and **not** to be inferred from this document: the ingestion service and
its authentication; the map provider; the live-tracking freshness threshold; the reporting cadence
and its battery trade-off; location retention; and any schema change.

The hardware choice is **provisional** and stays that way until §7 items 1–4 have been carried out
against real hardware on a real network.

---

## Sources

- [Mictrack MT710 product page](https://www.mictrack.com/product/cat-m1-nb-iot-pet-gps-tracker/) — specifications, bands, protocol
- [Mictrack: supported third-party platforms](https://help.mictrack.com/articles/supported-third-party-platforms/) — Traccar port 5030 for MT710
- [Mictrack: connecting to Traccar](https://help.mictrack.com/articles/how-to-connect-the-mt700-to-traccar/) — configuration commands
- [Mictrack MT710 communication protocol (PDF)](https://www.mictrack.com/downloads/protocols/Mictrack_Communication_Protocol_For_MT710_V1.0.pdf) — published, not machine-readable; field format unverified
- [Traccar issue #5307](https://github.com/traccar/traccar/issues/5307) — tlt2h UDP request, TCP data-cost argument
- [Traccar PR #5344](https://github.com/traccar/traccar/pull/5344) — UDP support merged June 2024
- [Safaricom (Wikipedia)](https://en.wikipedia.org/wiki/Safaricom) — B20/B3 LTE deployment, coverage
- [Safaricom NB‑IoT prepaid gas with M‑Gas](https://www.thefastmode.com/technology-solutions/16266-safaricom-taps-nb-iot-and-m-pesa-to-launch-prepaid-gas-service-for-kenyan-households) — evidence of commercial NB‑IoT use
- [Onomondo: IoT SIM cards for Kenya](https://onomondo.com/iot-sim/the-best-iot-sim-cards-for-kenya/) — multi-network M2M fallback option
