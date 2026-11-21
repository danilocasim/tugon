/**
 * Filipino for server messages shown to staff (via `useAct`). Keys are the exact
 * English `fail()` messages in src/server; template messages stay English.
 */
const fil: Record<string, string> = {
  // Network and unexpected errors
  "Can't reach the barangay server. Check your connection and try again.": "Hindi maabot ang server ng barangay. Tingnan ang koneksyon mo at subukan ulit.",
  "Something went wrong on our side. Your input is kept; please try again.": "May nagkaproblema sa panig namin. Naka-save pa ang inilagay mo; pakisubukan ulit.",

  // core.ts
  "That case no longer exists.": "Wala na ang kasong iyan.",
  "Your staff session ended. Sign in again.": "Natapos ang session mo bilang staff. Mag-sign in ulit.",
  "Please sign in to continue.": "Mag-sign in muna para magpatuloy.",
  "You don't have permission for that action on this case.": "Wala kang pahintulot para sa aksyong iyan sa kasong ito.",
  "Choose a landmark from the list.": "Pumili ng palatandaan mula sa listahan.",
  "Choose a purok.": "Pumili ng purok.",
  "That point is outside the barangay. Move the pin inside the boundary.": "Nasa labas ng barangay ang puntong iyan. Ilipat ang pin sa loob ng hangganan.",
  "Photos must be JPEG images.": "Dapat JPEG ang mga larawan.",
  "That photo is too large. Try a smaller one.": "Masyadong malaki ang larawan. Sumubok ng mas maliit.",
  "That file isn't a valid image.": "Hindi wastong larawan ang file na iyan.",

  // actions.ts · residents
  "Enter a valid email address.": "Maglagay ng wastong email address.",
  "That code doesn't match. Check the latest email and try again.": "Hindi tugma ang code. Tingnan ang pinakabagong email at subukan ulit.",
  "Verification code expired. Start again.": "Expired na ang verification code. Magsimula ulit.",
  "Choose your purok.": "Piliin ang purok mo.",
  "Please confirm you've read the privacy notice.": "Pakikumpirma na nabasa mo ang privacy notice.",
  "An account with this email already exists. Sign in instead.": "May account na gamit ang email na ito. Mag-sign in na lang.",
  "Missing submission key.": "Kulang ang submission key.",
  "This request belongs to another account.": "Pag-aari ng ibang account ang request na ito.",
  "The barangay is no longer waiting for details on this request.": "Hindi na naghihintay ang barangay ng detalye para sa request na ito.",
  "Work has already started, so this request can't be withdrawn. Message the barangay instead.":
    "Sinimulan na ang trabaho kaya hindi na mababawi ang request na ito. Magmensahe na lang sa barangay.",
  "Follow-ups are available for 14 days after a request is resolved.": "Puwedeng mag-follow-up sa loob ng 14 na araw matapos maresolba ang request.",
  "Enter a mobile number like 0917 123 4567.": "Maglagay ng mobile number gaya ng 0917 123 4567.",

  // actions.ts · staff sign-in and cases
  "Incorrect authenticator code.": "Mali ang authenticator code.",
  "This account is inactive.": "Hindi aktibo ang account na ito.",
  "Tanod accounts sign in to the Tanod app at /tanod.": "Sa Tanod app sa /tanod nagsa-sign in ang mga account ng tanod.",
  "Pick a category and urgency.": "Pumili ng kategorya at urgency.",
  "You can't refer this case.": "Hindi mo maaaring i-refer ang kasong ito.",
  "Choose a referral office.": "Pumili ng tanggapang pagre-refer-an.",
  "A case can't duplicate itself.": "Hindi puwedeng maging duplicate ng sarili ang isang kaso.",
  "This case isn't in your team's queue.": "Wala sa pila ng team mo ang kasong ito.",
  "Higher-priority cases are waiting.": "May naghihintay na mga kasong mas mataas ang prayoridad.",
  "Choose an active handler.": "Pumili ng aktibong humahawak ng kaso.",
  "Reassigning needs a reason for the audit log.": "Kailangan ng dahilan para sa audit log ang muling pag-assign.",
  "Assigning outside the routed team needs a reason.": "Kailangan ng dahilan ang pag-assign sa labas ng itinalagang team.",
  "This case is already in progress or closed.": "Ginagawa na o sarado na ang kasong ito.",
  "Only the assigned handler or a supervisor can message the resident here.": "Ang naka-assign na humahawak o superbisor lang ang puwedeng magmensahe sa residente rito.",
  "You can't add notes to this case.": "Hindi ka puwedeng magdagdag ng tala sa kasong ito.",
  "Start work before recording an outcome.": "Simulan muna ang trabaho bago itala ang resulta.",
  "That field photo is no longer available.": "Wala na ang larawang iyan mula sa lugar.",
  "Only intake or supervisors can change case restrictions.": "Ang intake o superbisor lang ang puwedeng magbago ng restriction ng kaso.",
  "Only intake staff can record walk-in or phone requests.": "Ang intake staff lang ang puwedeng magtala ng walk-in o request sa tawag.",

  // actions.ts · tanods and roster
  "Only supervisors and administrators manage tanods and the duty roster.": "Ang mga superbisor at administrator lang ang namamahala sa mga tanod at sa iskedyul ng duty.",
  "Choose an active tanod.": "Pumili ng aktibong tanod.",
  "That mobile number already belongs to an account.": "May account na gamit ang mobile number na iyan.",
  "Choose a date and shift.": "Pumili ng petsa at shift.",
  "The roster can be changed from yesterday up to 60 days ahead.": "Mababago ang iskedyul mula kahapon hanggang 60 araw mula ngayon.",
  "Choose a week.": "Pumili ng linggo.",
  "That assignment no longer exists.": "Wala na ang assignment na iyan.",
  "You can't change the field team on this case.": "Hindi mo puwedeng baguhin ang field team ng kasong ito.",
  "This assignment is already closed.": "Sarado na ang assignment na ito.",
  "Unknown action.": "Hindi kilalang aksyon.",

  // actions.ts · administration
  "Administration is limited to administrators.": "Para sa mga administrator lang ang pamamahala.",
  "Enter a valid email.": "Maglagay ng wastong email.",
  "Choose a role.": "Pumili ng tungkulin.",
  "Handlers need a team.": "Kailangan ng team ang humahawak ng kaso.",
  "That email already has an account.": "May account na ang email na iyan.",
  "You can't deactivate your own account.": "Hindi mo puwedeng i-deactivate ang sarili mong account.",
  "Account not found.": "Hindi makita ang account.",
  "Only administrators can change this account.": "Ang mga administrator lang ang puwedeng magbago ng account na ito.",
  "Targets must be between 1 and 240 hours.": "Dapat nasa pagitan ng 1 at 240 oras ang mga target.",
  "Higher urgency needs an equal or shorter target.": "Kailangan ng pareho o mas maikling target ang mas mataas na urgency.",
  "Only supervisors and administrators can change analysis settings.": "Ang mga superbisor at administrator lang ang puwedeng magbago ng setting ng pagsusuri.",
  "Settings out of range.": "Labas sa pinapayagang saklaw ang mga setting.",
  "Contact not found.": "Hindi makita ang contact.",

  // incidents.ts
  "Incidents are run by intake officers and supervisors.": "Ang mga intake officer at superbisor ang humahawak ng mga insidente.",
  "That incident no longer exists.": "Wala na ang insidenteng iyan.",
  "Link at least one open report.": "Mag-link ng kahit isang bukas na ulat.",
  "At least one linked report needs a map location.": "Kailangang may lokasyon sa mapa ang kahit isang naka-link na ulat.",
  "This incident is closed.": "Sarado na ang insidenteng ito.",
  "That report isn't part of this incident.": "Hindi bahagi ng insidenteng ito ang ulat na iyan.",
  "A supervisor closes incidents, because closing resolves the linked cases.": "Superbisor ang nagsasara ng insidente, dahil nareresolba ang mga naka-link na kaso kapag isinara ito.",
  "This incident is already closed.": "Sarado na ang insidenteng ito.",

  // lupon.ts
  "The Lupon docket is kept by the barangay secretary, the Peace & Order desk and supervisors.":
    "Ang kalihim ng barangay, ang Peace & Order desk at ang mga superbisor ang humahawak ng docket ng Lupon.",
  "That Lupon case no longer exists.": "Wala na ang kasong iyan sa Lupon.",
  "Only peace-and-order cases go to the Lupon.": "Mga kaso ng peace and order lang ang dinadala sa Lupon.",
  "Triage the case first; closed cases can't be filed.": "I-triage muna ang kaso; hindi maaaring i-file ang saradong kaso.",
  "This case already has an open Lupon proceeding.": "May bukas nang proceeding sa Lupon ang kasong ito.",
  "Pick a date within the next 60 days.": "Pumili ng petsa sa loob ng susunod na 60 araw.",
  "This Lupon case is closed.": "Sarado na ang kasong ito sa Lupon.",
  "That hearing no longer exists.": "Wala na ang pagdinig na iyan.",
  "Choose what happened.": "Piliin kung ano ang nangyari.",
  "This hearing was already recorded.": "Naitala na ang pagdinig na ito.",
  "Record a hearing on or after its date.": "Itala ang pagdinig sa araw nito o pagkatapos.",
  "Only conciliation can be extended.": "Ang pagkakasundo lang ang puwedeng pahabain.",
  "Conciliation was already extended once.": "Napahaba na nang isang beses ang pagkakasundo.",
  "Choose how the case ends.": "Piliin kung paano matatapos ang kaso.",
  "This Lupon case is already closed.": "Sarado na ang kasong ito sa Lupon.",
  "A certificate to file action needs a failed conciliation, an expired Pangkat period, or a respondent who didn't appear.":
    "Para makapag-isyu ng certificate to file action, kailangang hindi natuloy ang pagkakasundo, lumipas na ang panahon ng Pangkat, o hindi sumipot ang inirereklamo.",
  "Dismissal needs a hearing the complainant didn't attend.": "Maibabasura lang ito kung may pagdinig na hindi sinipot ng nagrereklamo.",

  // privacy.ts
  "Privacy settings are limited to administrators.": "Para sa mga administrator lang ang mga setting ng privacy.",
  "Retention must be between 1 and 120 months.": "Dapat nasa pagitan ng 1 at 120 buwan ang retention.",
  "Enter the DPO's email.": "Ilagay ang email ng DPO.",
  "Type your email exactly to confirm.": "I-type nang eksakto ang email mo para kumpirmahin.",

  // Messages the server builds with values; matched as patterns by localizeMessage.
  "{label} needs at least {min} characters.": "Kailangan ng hindi bababa sa {min} character ang {label}.",
  "{label} must be {max} characters or fewer.": "Hanggang {max} character lang ang {label}.",
  "{name} claimed this case a moment ago.": "Kinuha ni {name} ang kasong ito ilang sandali lang ang nakalipas.",
  "{name} is already assigned to this case.": "Naka-assign na si {name} sa kasong ito.",
  "You can't open {ref}.": "Hindi mo puwedeng buksan ang {ref}.",
  "{ref} is already closed.": "Sarado na ang {ref}.",
  "{ref} already belongs to another incident.": "Kasama na ang {ref} sa ibang insidente.",
  Someone: "May ibang staff",

  // Field labels used in those messages (cleanText in core.ts).
  Description: "Paglalarawan",
  Reply: "Sagot",
  "Follow-up": "Follow-up",
  Note: "Tala",
  Message: "Mensahe",
  "Message to resident": "Mensahe sa residente",
  Update: "Update",
  Outcome: "Resulta",
  Reason: "Dahilan",
  Instructions: "Mga tagubilin",
  "Office name": "Pangalan ng opisina",
  Scope: "Saklaw",
  Contact: "Contact",
  Title: "Pamagat",
  Complainant: "Nagrereklamo",
  Respondent: "Inirereklamo",
  "Respondent's address": "Address ng inirereklamo",
  "Nature of the dispute": "Uri ng alitan",
  Notes: "Mga tala",
  "Settlement terms": "Mga kondisyon ng kasunduan",
  "DPO name": "Pangalan ng DPO",
  "DPO phone": "Telepono ng DPO",
  Pending: "Nakabinbin",
};

export default fil;
