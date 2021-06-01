/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core')
// Ical wird verwendet, damit man den Kalender im Fromat ics von einer URL einlesen kann.
const ical = require('ical')
// Damit man die Daten über das Hyper Text Transfer Protocol (HTTP) übertragen kann.
const https = require('https')
// Für das Formatieren der Zeichenfolge
const utils = require('util')
//Bibliothek für die Arbeit mit Datums- und Uhrzeitangaben
const luxon = require('luxon')
// Zugriff zum Kalender
const URL = 'https://calendar.google.com/calendar/ical/stanislaw20%40gmail.com/private-97223bb9a0b576df6bedef3db614a608/basic.ics'


const dateOutOfRange = 'Datum liegt außerhalb des Bereiches, bitte wählen Sie ein anderes Datum.'
// Es wird verwendet, wenn innerhalb eines Zeitraums keine Daten vorhanden sind

const NoDataMessage = 'Leider sind keine Veranstaltungen für dieses Datum geplant. Möchten Sie noch einmal suchen?'
//Es wird verwendet, wenn es keine Veranstaltungen gibt

const oneEventMessage = 'Es gibt 1 Ereignis '
// Nachricht, die verwendet wird, wenn nur 1 Ereignis gefunden wird, wodurch Unterschiede in der Interpunktion berücksichtigt werden

const multipleEventMessage = 'Es gibt %d Ereignisse '
// Nachricht, die verwendet wird, wenn mehr als ein Ereignis gefunden wird, wodurch Unterschiede in der Interpunktion berücksichtigt werden

const scheduledEventMessage = 'für diesen Zeitraum geplant. '
// Text, der verwendet wird, nachdem die Anzahl der Ereignisse angegeben wurde

const firstThreeMessage = 'Hier sind die erste %d. '
// Die Werte innerhalb von {} werden gegen Variablen ausgetauscht

const eventSummary = 'Das %s Ereignis ist, %s bei %s auf %s '
// Wird nur für die Karte in der Begleit-App verwendet

const cardContentSummary = '%s bei %s auf %s '
const wrongDate = 'Es tut mir leid. An welchem Tag sollte ich nach Ereignissen suchen?'

// Mehr Infotext
const haveEventsRepromt = 'Geben Sie mir eine Ereignisnummer, um weitere Informationen zu erhalten'
const yesMessage = haveEventsRepromt + ' oder nennen Sie einen anderen Tag.'
const eventNumberMoreInfoText = 'Sie können die Ereignisnummer für weitere Informationen angeben.'
const wrongNumber = "Entschuldigung, das verstehe ich nicht. Bitte nennen Sie mir die Nummer."

const LaunchRequestHandler = {
  canHandle (handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest'
  },
  async handle (handlerInput) {
    const speakOutput = 'Herzlich Willkommen, Sie können Ihren Kalender prüfen. Welcher Tag interessiert Sie?'
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes()
    //Es wird eine Session erstellt
    sessionAttributes.eventList = await initSchedule()
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse()
  }
}

const CalendarIntentHandler = {
  canHandle (handlerInput) {
    const {request} = handlerInput.requestEnvelope
    return request.type === 'IntentRequest'
      && request.intent.name === 'CalendarIntent'
      && request.dialogState !== 'COMPLETED'
  },
  async handle (handlerInput) {

    const currentIntent = handlerInput.requestEnvelope.request.intent

    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes()
    // Slots bekommen
    const dayValue = currentIntent.slots.dayValue
    const value = getDateFromSlot(dayValue.value)
    console.log("*****************************************************************")
    console.log(value)
    return showRelevantSchedule(handlerInput, value, sessionAttributes.eventList)
  }
}

const DetailsIntentHandler = {
  canHandle (handlerInput) {
    const {request} = handlerInput.requestEnvelope
    return request.type === 'IntentRequest'
      && request.intent.name === 'DetailsIntent'
      && request.dialogState !== 'COMPLETED'
  },
  handle (handlerInput) {

    const currentIntent = handlerInput.requestEnvelope.request.intent
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes()

    // Slots bekommen
    const eventIndex = currentIntent.slots.eventNumber
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes()
    const details = sessionAttributes.moreDetails
    const number = parseInt(eventIndex.value, 10)
    if (Number.isInteger(number)) {
    // Überprüfung, ob die Sitzung eine Ereignisliste enthält, um weitere Details bereitzustellen
      if(details && details.length > 0) {
        let message = getEventDescription(number, details)
        message += " Wollten Sie noch etwas anhören?"
        return handlerInput.responseBuilder
          .speak(message)
          .reprompt(message)
          .getResponse()
      } else {
        const message = "Es gibt keine Veranstaltungen. Bitte fragen Sie nach einem anderen bestimmten Tag."
        return handlerInput.responseBuilder
          .speak(message)
          .reprompt(message)
          .getResponse()
      }
    } else {
      return handlerInput.responseBuilder
        .speak(wrongNumber)
        .reprompt(wrongNumber)
        .getResponse()
    }
  }
}

const HelpIntentHandler = {
  canHandle (handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
  },
  handle (handlerInput) {
    const speakOutput = 'Sie können weitere Daten zu Ihrem Zeitplan anfordern! Wie kann ich Ihnen helfen?'

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse()
  }
}

const CancelAndStopIntentHandler = {
  canHandle (handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent')
  },
  handle (handlerInput) {
    const speakOutput = 'Tschüß!'

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .getResponse()
  }
}

const YesIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.YesIntent'
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(yesMessage)
      .reprompt(yesMessage)
      .getResponse()
  },
}

/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet
 * */
const FallbackIntentHandler = {
  canHandle (handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent'
  },
  handle (handlerInput) {
    const speakOutput = 'Entschuldigung, das weiß ich nicht. Bitte versuchen Sie es erneut.'

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse()
  }
}
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs
 * */
const SessionEndedRequestHandler = {
  canHandle (handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest'
  },
  handle (handlerInput) {
    console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`)
    // Any cleanup logic goes here.
    return handlerInput.responseBuilder.getResponse() // notice we send an empty response
  }
}
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents
 * by defining them above, then also adding them to the request handler chain below
 * */
const IntentReflectorHandler = {
  canHandle (handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
  },
  handle (handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope)
    const speakOutput = `Du hast gerade ausgelöst ${intentName}`

    return handlerInput.responseBuilder
      .speak(speakOutput)
      //.reprompt('Fügen Sie eine Wiederholung hinzu, wenn Sie die Sitzung offen halten möchten, damit der Benutzer antworten kann')
      .getResponse()
  }
}
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below
 * */
const ErrorHandler = {
  canHandle () {
    return true
  },
  handle (handlerInput, error) {
    const speakOutput = 'Entschuldigung, ich hatte Probleme damit, was Sie gefragt haben. Bitte versuchen Sie es erneut.'
    console.log(`~~~~ Error handled: ${JSON.stringify(error)}`)

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse()
  }
}

/* FUNCTIONS */
function initSchedule () {
  return new Promise((resolve, reject) => {
    //Anforderung von Daten vom Server
    const request = https.get(URL, response => {
    //Wir kriegen die Ressource als utf8 string
      response.setEncoding('utf8')

      let returnData = ''
      
    //Überprüfung von Antwort von HTTP-Status
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return reject(new Error(`${response.statusCode}: ${response.req.getHeader('host')} ${response.req.path}`))
      }
    // Daten an `returnData` anhängen 
      response.on('data', chunk => {
        returnData += chunk
      })
    //Das "End" zeigt an, dass der gesamte Körper empfangen wurde
      response.on('end', () => {
    //Mit dieser Methode kann man alle benötigte Infos (der Programmversion, der ursprünglichen Zeitzone des Erstellers sowie den Details der Ereignisse wie Datum und Uhrzeit von Start
    //und Ende, Zusammenfassung und Beschreibung) aus ics-Datei extrahieren
        const data = ical.parseICS(returnData)
        const eventList = []
        for (var k in data) {
        //Überprüfung, ob ein Objekt eine eigene Eigenschaft mit einem bestimmten Schlüssel hat
          if (data.hasOwnProperty(k)) {
            const ev = data[k]
            //Auswählen von den für uns relevanten Daten und Erstellung des Objektes, um sie zu speichern
            const eventData = {
              summary: removeTags(ev.summary),
              location: removeTags(ev.location),
              description: removeTags(ev.description),
              start: ev.start,
              end: ev.end,
              created: ev.created
            }
            // Hinzufügen des neu erstellten Objekt einem Array für späteren Verwendung.
            eventList.push(eventData)
          }
        }
        resolve(eventList)
      })
      response.on('error', error => {
        reject(error)
      })
    })
    request.end()
  })
}

function showRelevantSchedule (handlerInput, eventDate, eventList) {
  let output = NoDataMessage
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes()
  sessionAttributes.moreDetails = []
  //Überprüfung, was man von Alexa bekommt (und versteht)
  if (eventDate.startDate && eventDate.endDate) {
        // Initiieren des neuen Arrays und das Einfüllen von Arrays mit Ereignissen, die zwischen die beiden Daten passen
    const relevantEvents = getEventsBetweenDates(eventDate.startDate, eventDate.endDate, eventList)
    //Wenn es einige Ereignisse für diesen Zeitraum gibt =>(Anzeigen)
    if (relevantEvents.length > 0) {
        // Abspeichern von relevante Details für die zukünftigen Anforderungen
      sessionAttributes.moreDetails = relevantEvents
      output = oneEventMessage
        //Wenn es mehr als ein Ereignis gibt, muss man eine Multi-Event-Nachricht anzeigen
      if (relevantEvents.length > 1) {
        output = utils.format(multipleEventMessage, relevantEvents.length)
      }
      const details = []
      output += scheduledEventMessage
        //Wenn es mehr als eine Ereignisse gibt => Anzeigen zuerst 3
      if (relevantEvents.length > 1) {
        output += utils.format(firstThreeMessage, relevantEvents.length > 3 ? 3 : relevantEvents.length)
      }
        // Hinzufügen von dem Text aus der ersten Nachricht
      if (relevantEvents[0]) {
        output += utils.format(eventSummary, 'erste', relevantEvents[0].summary,
          relevantEvents[0].location ? relevantEvents[0].location : 'unbekannte Lokation',
          luxon.DateTime.fromISO(relevantEvents[0].start).toLocaleString(luxon.DateTime.DATETIME_MED) + '.')
      }
        //Hinzufügen vob dem Text aus der zweiten Nachricht
      if (relevantEvents[1]) {
        output += utils.format(eventSummary, 'zweite', relevantEvents[1].summary,
          relevantEvents[1].location ? relevantEvents[1].location : 'unbekannte Lokation',
          luxon.DateTime.fromISO(relevantEvents[1].start).toLocaleString(luxon.DateTime.DATETIME_MED) + '.')
      }
      
        //Hinzufügen von dem Text aus der dritten Nachricht
      if (relevantEvents[2]) {
        output += utils.format(eventSummary, 'dritte', relevantEvents[2].summary,
          relevantEvents[2].location ? relevantEvents[2].location : 'unbekannte Lokation',
          luxon.DateTime.fromISO(relevantEvents[2].start).toLocaleString(luxon.DateTime.DATETIME_MED) + '.')
      }
      output += eventNumberMoreInfoText
      return handlerInput.responseBuilder
        .speak(output)
        .reprompt(haveEventsRepromt)
        .getResponse()
    } else {
      return handlerInput.responseBuilder
        .speak(output)
        .reprompt(output)
        .getResponse()
    }
  } else {
    return handlerInput.responseBuilder
      .speak(wrongDate)
      .reprompt(wrongDate)
      .getResponse()
  }
}

function getEventDescription(number, details) {
    //Wenn der Benutzer nach einer Ereignisnummer fragt, die größer als die Anzahl der Ereignisse ist, die wir für diesen Tag haben
  if(number > details.length) {
    const last = details[details.length - 1]
    if(last.description)
      return `Sie haben nach ${number} gefragt, aber Sie haben nur ${details.length} Veranstaltung. Die Beschreibung der letzten Veranstaltung ist: ${last.description}.`
    else
      return `Sie haben nach ${number} gefragt, aber Sie haben nur ${details.length} Veranstaltungen. Hier gibt es kein Beschreibungen für die letzte Veranstaltung.`
  } else if (number < 1) {
    const first = details[0]
    if(first.description)
      return `Sie haben nach ${number} gefragt, aber das ist zu wenig. Die Beschreibung für die erste Veranstaltung ist: ${first.description}.`
    else
      return `Sie haben nach ${number} gefragt, aber das ist zu wenig. Hier gibt es keine Beschreibungen für die erste Veranstaltung.`
  } else {
    //Anzeigen von Details
    const event = details[number - 1]
    if(event.description)
      return `Beschreibung für ${number} ist: ${event.description}`
    else
      return `Hier gibt es keine Beschreibungen für ${number} Veranstaltung.`
  }
}

// Löschen HTML tags aus string
function removeTags (str) {
  if (str) {
    return str.replace(/<(?:.|\n)*?>/gm, '')
  }
}

// Given an AMAZON.DATE slot value parse out to usable JavaScript Date object
// Utterances that map to the weekend for a specific week (such as ?this weekend?) convert to a date indicating the week number and weekend: 2015-W49-WE.
// Utterances that map to a month, but not a specific day (such as ?next month?, or ?December?) convert to a date with just the year and month: 2015-12.
// Utterances that map to a year (such as ?next year?) convert to a date containing just the year: 2016.
// Utterances that map to a decade convert to a date indicating the decade: 201X.
// Utterances that map to a season (such as ?next winter?) convert to a date with the year and a season indicator: winter: WI, spring: SP, summer: SU, fall: FA)
function getDateFromSlot (rawDate) {
  // Versuch die Daten zu analysieren
  const date = new Date(Date.parse(rawDate))
  // Erstellen des leeren Objektes, das später verwenden wird
  const eventDate = {}
  let dates
  //Wenn Daten nicht analysiert werden konnten, muss dies an dem falschen Format liegen
  if (isNaN(date)) {
    // Um herauszufinden, um welche Art von Datum es sich handelt, kann man es aufteilen und zählen, wie viele Teile wir oben gesehen haben.
    const res = rawDate.split('-')
    //Wenn wir 2 Bits haben, die eine 'W'-Wochennummer enthalten
    if (res.length === 2 && res[1].indexOf('W') > -1) {
      dates = getWeekData(res)
      eventDate['startDate'] = new Date(dates.startDate)
      eventDate['endDate'] = new Date(dates.endDate)
    //Wenn wir 3 Bits haben, könnten wir entweder ein gültiges Datum (das bereits analysiert worden ist) oder ein Wochenende haben
    } else if (res.length === 3) {
      dates = getWeekendData(res)
      eventDate['startDate'] = new Date(dates.startDate)
      eventDate['endDate'] = new Date(dates.endDate)
    //Alles andere wäre für diese Fähigkeit außerhalb der Reichweite
    } else {
      eventDate['error'] = dateOutOfRange
    }
    // Der ursprüngliche Slot-Wert wurde korrekt analysiert
  } else {
    //Das Konvertieren von den einzelnen Tag in einen Bereich von 0:00 => 11:59
    eventDate['startDate'] = new Date(date).setUTCHours(0, 0, 0, 0)
    eventDate['endDate'] = new Date(date).setUTCHours(24, 0, 0, 0)
  }
  return eventDate
}
//Input von Alexa wird in zwei Tage (von bis) konvertiert
//Bei einer Wochennummer das Zurückgeben von Daten für beide Wochenendtage

function getWeekendData (res) {
// Wir wissen, dass wir für die Woche nur die Jahres- und Wochennummer und den WE-Schlüssel => Array von 3 Elementen haben werden
  if (res.length === 3) {
    const saturdayIndex = 5
    const sundayIndex = 6
    const weekNumber = res[1].substring(1)

    const weekStart = w2date(res[0], weekNumber, saturdayIndex)
    const weekEnd = w2date(res[0], weekNumber, sundayIndex)

    return {
      startDate: weekStart,
      endDate: weekEnd,
    }
  }
}
    
// Bei einer Wochennummer werden die Daten sowohl für das Startdatum als auch für das Enddatum zurückgegeben
function getWeekData (res) {
    
//Wir wissen, dass wir für die Woche nur die Jahres- und Wochenzahl => Array von 2 Elementen haben werden
  if (res.length === 2) {

    const mondayIndex = 0
    const sundayIndex = 6

    const weekNumber = res[1].substring(1)

    const weekStart = w2date(res[0], weekNumber, mondayIndex)
    const weekEnd = w2date(res[0], weekNumber, sundayIndex)

    return {
      startDate: weekStart,
      endDate: weekEnd,
    }
  }
}

//Es wird verwendet, um die Daten für die angegebenen Wochennummern zu ermitteln
function w2date (year, wn, dayNb) {
  const day = 86400000
  const j10 = new Date(year, 0, 10, 12, 0, 0)
  const j4 = new Date(year, 0, 4, 12, 0, 0)
  const mon1 = j4.getTime() - j10.getDay() * day
  return new Date(mon1 + ((wn - 1) * 7 + dayNb) * day)
}

//Durchlaufen und Überprüfung der Ereignisse aus den iCal-Daten, welche zwischen unseren Startdaten und Enddaten liegen
function getEventsBetweenDates (startDate, endDate, eventList) {
  const data = []
  for (let i = 0; i < eventList.length; i++) {
    const event = eventList[i]
    const start = luxon.DateTime.fromISO(event.start)
    const end = luxon.DateTime.fromISO(event.end)
    //Wenn ein Ereignis im Datumsbereich liegt, wird eine Antwort hinzugefügt
    if (startDate <= start && endDate >= end) {
      data.push(eventList[i])
    }
  }
  console.log('GEFUNDEN ' + data.length + ' Ereignisse zwischen diesen Zeiten')
  return data
}

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom
 * */
exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    CalendarIntentHandler,
    DetailsIntentHandler,
    HelpIntentHandler,
    YesIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
    IntentReflectorHandler)
  .addErrorHandlers(
    ErrorHandler)
  .withCustomUserAgent('sample/hello-world/v1.2')
  .lambda()
