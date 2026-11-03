// A1 · Językowa podróż po Polsce (A1) — K. Szostak-Król, 2019
const JP = () => ({nivel: "A1", parte: "Viagem pela Polônia", fonte: "Językowa podróż po Polsce (A1) · K. Szostak-Król, 2019", audioExt: true});
CURSO.push(
 {...JP(), id:"a1p-1", pt:"Bem-vindo à Polônia", pl:"Witamy w Polsce", obj:"Conhecer cidades, rios, montanhas e monumentos famosos e descrevê-los com jaki?",
  gram:[["Jaki? Jaka? Jakie?","Jakie to miasto? – Duże i stare. Jaka to rzeka? – Długa. Jakie to góry? – Wysokie (plural de coisas: -e)."],
   ["Onde fica","Kraków leży nad Wisłą. Gdańsk leży nad morzem. Zakopane leży w górach (w Tatrach)."]],
  pal:[["Witamy w Polsce!","Bem-vindo à Polônia!","vi-TA-mê f PÓLS-tse"],["miasto","cidade","MIAS-to"],["rzeka","rio","JÉ-ka"],["góry","montanhas","GU-rê"],["Tatry","Montes Tatra","TA-trê"],["Wisła","Vístula (maior rio)","VIS-ua"],["Odra","Oder (rio)","Ó-dra"],["Morze Bałtyckie","Mar Báltico","MÓ-je bau-TÊTS-kie"],["Wawel","castelo real de Cracóvia","VA-vel"],["Pałac Kultury i Nauki","Palácio da Cultura e Ciência","PA-uats kul-TU-rê i na-U-ki"],["kopalnia soli w Wieliczce","mina de sal de Wieliczka","ko-PAL-nha SÓ-li v vie-LITCH-tse"],["stary, nowoczesny","antigo, moderno","STA-rê, no-vo-TCHÉS-nê"],["Jakie to miasto?","Que cidade é essa? Como ela é?","IA-kie to MIAS-to"]],
  dial:[["Jakie miasto chcesz zobaczyć?","Que cidade você quer conhecer?"],["Kraków. To stare i piękne miasto nad Wisłą.","Cracóvia. É uma cidade antiga e bonita às margens do Vístula."],["A ja chcę zobaczyć Tatry. To najwyższe góry w Polsce.","E eu quero ver os Tatra. São as montanhas mais altas da Polônia."]],
  ex:[{enun:"Maior rio da Polônia:", ops:["Wisła","Odra","Warta"], ok:0},
   {enun:"Montanhas mais altas:", ops:["Tatry","Sudety","Bieszczady"], ok:0},
   {enun:"Gdańsk leży nad…", ops:["morzem","górami","Wisłą w Krakowie"], ok:0},
   {enun:"Jakie to góry? – ___ .", ops:["Wysokie","Wysoki","Wysoka"], ok:0},
   {enun:"Wawel fica em…", ops:["Cracóvia","Varsóvia","Gdańsk"], ok:0},
   {enun:"Escreva: rio", tipo:"txt", aceitas:["rzeka"], resp:"rzeka"}]},

 {...JP(), id:"a1p-2", pt:"Vamos passear!", pl:"Jedziemy na wycieczkę!", obj:"Falar de passeios na natureza e dos animais da floresta.",
  gram:[["Para onde e onde","Jedziemy nad morze / nad jezioro (nad + acusativo, destino) → Jesteśmy nad morzem (nad + instrumental, lugar). Jedziemy w góry → Jesteśmy w górach. Idziemy do lasu → Jesteśmy w lesie."]],
  pal:[["wycieczka","passeio, excursão","vê-TCHIÉTCH-ka"],["las","floresta","las"],["jezioro","lago","ie-JIÓ-ro"],["Mazury","Masúria (região dos lagos)","ma-ZU-rê"],["Puszcza Białowieska","Floresta de Białowieża","PUX-tcha bia-uo-VIÉS-ka"],["żubr","bisão-europeu","jubr"],["jeleń","cervo","IÉ-lenh"],["lis","raposa","lis"],["dzik","javali","djik"],["wiewiórka","esquilo","vie-VIUR-ka"],["bocian","cegonha","BÓ-tchian"],["Jedziemy nad jezioro.","Vamos para o lago.","ie-DJIÉ-mê nad ie-JIÓ-ro"],["Jesteśmy w lesie.","Estamos na floresta.","ies-TÉCH-mê v LÉ-chie"]],
  dial:[["Dokąd jedziecie na wycieczkę?","Para onde vocês vão passear?"],["Jedziemy do Puszczy Białowieskiej. Chcemy zobaczyć żubry.","Vamos para a Floresta de Białowieża. Queremos ver os bisões."],["A my jedziemy nad jezioro, na Mazury.","E nós vamos para o lago, na Masúria."]],
  ex:[{enun:"Jedziemy ___ morze.", ops:["nad","w","do"], ok:0},
   {enun:"Jesteśmy nad ___ (jezioro).", ops:["jeziorem","jezioro","jeziorze"], ok:0},
   {enun:"Idziemy do ___ (las).", ops:["lasu","las","lesie"], ok:0},
   {enun:"żubr é…", ops:["bisão-europeu","urso","alce"], ok:0},
   {enun:"Ave símbolo do campo polonês:", ops:["bocian","orzeł","wróbel"], ok:0},
   {enun:"Escreva: floresta", tipo:"txt", aceitas:["las"], resp:"las"}]},

 {...JP(), id:"a1p-3", pt:"Um pouco de história", pl:"Trochę historii", obj:"Conhecer heróis poloneses e contar uma lenda simples.",
  texto:"Dawno temu żyło trzech braci: Lech, Czech i Rus. Pewnego dnia Lech zobaczył na drzewie białego orła. Za orłem było czerwone niebo. Lech powiedział: „Tu zostaniemy”. Tak powstało miasto Gniezno, a biały orzeł na czerwonym tle jest do dziś w godle Polski.",
  textoPt:"Há muito tempo viviam três irmãos: Lech, Czech e Rus. Um dia Lech viu numa árvore uma águia branca. Atrás da águia o céu estava vermelho. Lech disse: “Aqui vamos ficar”. Assim surgiu a cidade de Gniezno, e a águia branca em fundo vermelho está até hoje no brasão da Polônia.",
  gram:[["Kto to był? Kim był?","Kto to był? – To był Fryderyk Chopin. To była Maria Skłodowska-Curie. Kim był Chopin? – Był kompozytorem (być + instrumental)."]],
  pal:[["historia","história","rris-TÓ-ria"],["bohater","herói","bo-RRA-ter"],["legenda","lenda","le-GÉN-da"],["Kto to był?","Quem foi?","kto to bêu"],["kompozytor","compositor","kom-po-ZÊ-tor"],["uczona","cientista (mulher)","u-TCHÓ-na"],["astronom","astrônomo","as-TRÓ-nom"],["król","rei","krul"],["orzeł","águia","Ó-jeu"],["Fryderyk Chopin","Frédéric Chopin","frê-DÉ-rêk XÓ-pen"],["Jan Paweł II","João Paulo II","ian PA-veu DRU-gi"],["Lech, Czech i Rus","Lech, Czech e Rus (irmãos da lenda)","lerr, tcherr i rus"]],
  dial:[["Kim był Mikołaj Kopernik?","Quem foi Nicolau Copérnico?"],["To był polski astronom. Powiedział, że Ziemia krąży wokół Słońca.","Foi um astrônomo polonês. Disse que a Terra gira em torno do Sol."],["A Chopin?","E Chopin?"],["To był kompozytor i pianista.","Foi compositor e pianista."]],
  ex:[{enun:"O que Lech viu na árvore?", ops:["uma águia branca","um dragão","uma sereia"], ok:0},
   {enun:"Cidade fundada por Lech:", ops:["Gniezno","Kraków","Płock"], ok:0},
   {enun:"Chopin foi…", ops:["compositor","astrônomo","rei"], ok:0},
   {enun:"Perguntar \"quem foi?\" sobre uma mulher:", ops:["Kto to był?","Kto to była?","Kim to była?"], ok:0, expl:"A pergunta fica sempre no masculino; a resposta concorda: To była…"},
   {enun:"bohater =", ops:["herói","rei","lenda"], ok:0},
   {enun:"Escreva: águia", tipo:"txt", aceitas:["orzel"], resp:"orzeł"}]}
);
