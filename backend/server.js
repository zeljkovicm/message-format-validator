const express = require('express');
const fs = require('fs'); // Ugrađeni Node.js modul za rad sa fajl sistemom
const path = require('path'); // Ugrađeni Node.js modul za rad sa putanjama fajlova
const Ajv = require('ajv'); // Biblioteka za JSON Schema validaciju (AJV)
const app = express();
const port = process.env.PORT || 3000; // Port na kojem će server slušati

// Middleware za parsiranje JSON tela zahteva
// Omogućava nam da pristupimo JSON podacima poslatim u telu zahteva putem req.body
app.use(express.json());

// --- RUTE ---

// Osnovna ruta za testiranje servera
app.get('/', (req, res) => {
  res.send('JSON Validation App Backend is running!');
});

// RUTA za dohvatanje shema po tipu (npr. /schemas/met)
app.get('/schemas/:type', (req, res) => {
    // req.params.type hvata deo URL-a nakon /schemas/
    const schemaType = req.params.type.toLowerCase(); // Pretvaramo u mala slova radi standardizacije imena fajlova

    // path.join sigurno konstruiše putanju do fajla sheme
    // __dirname je putanja do foldera gde se server.js nalazi (backend)
    // '..' ide jedan nivo gore (u root foldera projekta)
    // 'schemas' je folder gde čuvamo sheme
    // `${schemaType}.json` dodaje ime fajla sheme (npr. met.json)
    const schemaFileName = `${schemaType}.json`;
    const schemasFolderPath = path.join(__dirname, '..', 'schemas');
    const schemaFilePath = path.join(schemasFolderPath, schemaFileName);


    console.log(`Attempting to retrieve schema for type: ${schemaType}`);
    console.log(`Looking for file at path: ${schemaFilePath}`);


    // Asinhrono čitanje fajla sheme
    fs.readFile(schemaFilePath, 'utf8', (err, data) => {
        console.log('fs.readFile callback executed.');
        if (err) {
            console.error('File system error:', err);
            // Provera da li greška znači da fajl nije pronađen
            if (err.code === 'ENOENT') {
                console.log('Error code is ENOENT (Not Found).');
                res.status(404).json({ error: `Schema for type '${schemaType}' not found.` });
            } else {
                console.log('Other file system error:', err.code);
                res.status(500).json({ error: 'Error reading schema file.', details: err.message });
            }
            return; // Prekida dalje izvršavanje nakon slanja odgovora
        }

        console.log('File read successfully.');
        console.log(`Data length: ${data.length}`);
        console.log(`Data start: "${data.substring(0, Math.min(data.length, 50))}"`); // Prikazuje prvih 50 karaktera ili manje ako je fajl kraći


        try {
            console.log('Attempting JSON.parse...');
            // Parsiranje pročitanog JSON stringa u JavaScript objekat
            const schema = JSON.parse(data);
            console.log('JSON parsed successfully.');
            // Slanje parsiranog objekta kao JSON odgovora
            res.json(schema);
        } catch (parseErr) {
            console.error('JSON Parse error caught:', parseErr);
             // Vraća 500 ako sadržaj fajla nije validan JSON
            res.status(500).json({ error: 'Error parsing schema file.', details: parseErr.message });
        }
    });
});


// NOVA RUTA za validaciju JSON poruka (koristi POST metod) - ZAMENITE POSTOJEĆI BLOK ZA /validate
app.post('/validate', (req, res) => {
  const messageToValidate = req.body.message;
  const messageType = req.body.type;

  console.log('Received validation request:');
  console.log('Message Type:', messageType);
  console.log('Message:', JSON.stringify(messageToValidate, null, 2));

  // Provera da li su 'message' i 'type' prisutni i ispravnog tipa
  if (!messageToValidate || typeof messageType !== 'string' || messageType.length === 0) {
      console.log('Validation request missing message or type.');
      return res.status(400).json({
          error: 'Invalid request body format.',
          details: 'Request body must be a JSON object containing non-empty \'message\' and \'type\' fields.'
      });
  }

  const schemaFileName = `${messageType.toLowerCase()}.json`; // Ime fajla sheme na osnovu tipa poruke
  const schemasFolderPath = path.join(__dirname, '..', 'schemas'); // Putanja do foldera sa shemama
  const schemaFilePath = path.join(schemasFolderPath, schemaFileName); // Kompletna putanja do fajla sheme

  // Prvo, pročitaj odgovarajuću shemu fajla
  fs.readFile(schemaFilePath, 'utf8', (err, data) => {
      if (err) {
          console.error('Error reading schema file for validation:', err);
          // Ako shema za traženi tip ne postoji
          if (err.code === 'ENOENT') {
              return res.status(400).json({ // Vraćamo 400 jer klijent traži validaciju sa nepostojećim tipom sheme
                  error: `Schema for type '${messageType}' not found. Cannot perform validation.`,
                  details: `Make sure a schema file named '${schemaFileName}' exists in the 'schemas' folder.`
              });
          } else {
              // Neka druga greška pri čitanju fajla
              return res.status(500).json({
                  error: 'Error reading schema file for validation.',
                  details: err.message
              });
          }
      }

      let schema;
      try {
          // Parsiraj JSON shemu
          schema = JSON.parse(data);
          console.log(`Successfully read and parsed schema for type: ${messageType}`);
      } catch (parseErr) {
          console.error('Error parsing schema file for validation:', parseErr);
          // Vraća 500 ako shema fajl nije validan JSON
          return res.status(500).json({
              error: 'Error parsing schema file for validation.',
              details: parseErr.message
          });
      }

      // --- Izvrši Validaciju pomoću AJV-a ---
      try {
          const ajv = new Ajv(); // Kreiraj novu AJV instancu
          // Ako shema ima $ref reference, možda će trebati dodatna konfiguracija AJV-a ili pre-učitavanje sub-shema.
          // Za sada, pretpostavljamo jednostavne sheme bez $ref.

          const validate = ajv.compile(schema); // "Kompajliraj" shemu u validacionu funkciju

          const isValid = validate(messageToValidate); // Izvrši validaciju poruke

          if (isValid) {
              console.log('Message is VALID.');
              // Vraća 200 OK ako je poruka validna
              res.status(200).json({
                  valid: true,
                  message: 'JSON message is valid according to the schema.'
              });
          } else {
              console.log('Message is INVALID. Errors:', validate.errors);
              // Vraća 400 Bad Request i listu grešaka ako poruka nije validna
              res.status(400).json({
                  valid: false,
                  message: 'JSON message validation failed.',
                  errors: validate.errors // AJV popunjava .errors niz kada validacija ne uspe
              });
          }

      } catch (validationError) {
          console.error('Error during AJV validation process:', validationError);
          // Hvata greške ako npr. sama shema nije ispravno formatirana ili AJV naiđe na problem
          res.status(500).json({
              error: 'An internal error occurred during the validation process.',
              details: validationError.message
          });
      }
  });
});


// --- POKRETANJE SERVERA ---
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});