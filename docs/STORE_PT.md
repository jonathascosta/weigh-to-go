# A App Store

Os passos que só o dono pode dar para colocar o Weigh to Go na App Store, em ordem, com o que já pode
começar. Seguem os do Arrows (`jonathascosta/arrows`, `docs/STORE.md`) e reaproveitam a conta, a chave
da API do App Store Connect e o certificado de distribuição dele. Os mesmos passos estão em inglês em
[STORE.md](STORE.md); uma mudança em um vai para o outro no mesmo pull request. O porquê de o app ser
feito assim está em [decisions.md](decisions.md); o trabalho está planejado no
[sprint 3](sprint-3.md) e no [sprint 4](sprint-4.md).

## O que já pode começar

Os passos 1 a 3 e o 6 não dependem do código, e alguns levam dias para a Apple ou a Google
processarem: o nome, o acordo de apps pagos, os dados bancários e fiscais, o app no AdMob e a mensagem
de consentimento.

## Os passos do dono

1. **Registrar o id do app e depois criar o app.**
   - Primeiro, em developer.apple.com, Certificates, Identifiers & Profiles, Identifiers, +: um App
     ID explícito, `net.jonathas.weightogo`, com **HealthKit** ligado (In-App Purchase já vem
     ligado). O New App do App Store Connect só oferece ids registrados ali.
   - Depois, no App Store Connect, Apps, +, New App: iOS, o nome (no máximo 30 caracteres; se "Weigh
     to Go" estiver ocupado, uma variante como "Weigh to Go: Weight Diary", e avise a sessão, que o
     põe na listagem), idioma principal English (U.S.), o bundle id `net.jonathas.weightogo`, SKU
     `net.jonathas.weightogo`, acesso completo.
   - App Information: categoria Health & Fitness (Saúde e fitness). Em Pricing and Availability,
     desligue a disponibilidade do app em Macs com Apple silicon: o app Saúde não existe lá.
2. **O acordo de apps pagos.** Em Business (Agreements, Tax and Banking), aceite o Paid Applications
   Agreement e preencha a conta bancária e os formulários fiscais: sem eles nenhuma compra dentro do
   app funciona no sandbox nem no TestFlight. Depois, inscreva-se no App Store Small Business Program
   (developer.apple.com/app-store/small-business-program), que baixa a comissão da Apple de 30% para
   15% para quem fatura menos de um milhão de dólares por ano.
3. **Os secrets.** Em Settings, Environments deste repositório, crie um environment chamado
   `app-store`, limite os branches de deploy dele ao `main` e adicione os seis secrets do Arrows. O
   GitHub nunca mostra um secret de novo, então os valores vêm de onde foram criados:
   - `APPLE_TEAM_ID`: developer.apple.com, Membership details, Team ID.
   - `APP_STORE_CONNECT_API_KEY_ID` e `APP_STORE_CONNECT_API_ISSUER_ID`: App Store Connect, Users and
     Access, Integrations, a chave do time (a que o Arrows e o Trilha usam).
   - `APP_STORE_CONNECT_API_KEY_P8`: o arquivo `.p8` dessa chave, em base64
     (`base64 -w0 AuthKey_….p8`). A Apple deixa baixá-lo uma vez só; se ele se perdeu, crie uma chave
     nova ali e atualize o secret do Arrows também.
   - `IOS_DISTRIBUTION_CERTIFICATE_P12`: o `dist.p12` de `~/apple-signing` (STORE.md do Arrows, passo
     5), em base64 (`base64 -w0 dist.p12`); `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`: a senha dele.

   Secrets continuam secretos num repositório público: o workflow `iOS` que os pull requests rodam
   não usa nenhum, e o workflow do TestFlight roda só no `main`, à mão.

4. **O primeiro build.** Quando a primeira story do Sprint 3 estiver integrada, rode o workflow
   **TestFlight** na aba Actions. Um app novo ainda não tem testadores: quando o build aparecer no
   App Store Connect (aba TestFlight do app, depois de alguns minutos de processamento), crie um grupo
   de **Internal Testing**, ligue a distribuição automática e adicione-se. Depois instale o app
   TestFlight da Apple no iPhone, aceite o convite, instale o build e use-o. Todo build seguinte é
   igual: rodar o workflow, instalar pelo TestFlight, contar o que parece errado.
5. **A compra dentro do app.** Em Monetization, In-App Purchases do app, crie um **Non-Consumable**
   com o product id `net.jonathas.weightogo.removeads`, um nome de referência ("Remove ads"), o preço
   que escolher, o nome e a descrição em inglês e português ("Remove ads" · "Pay once and never see
   ads again"; "Remover anúncios" · "Pague uma vez e nunca mais veja anúncios"), se vale para o
   Compartilhamento Familiar, e a captura de tela para a revisão (a sessão a faz). A primeira compra
   vai junto com a primeira versão (passo 11).
6. **AdMob.**
   - Adicione um app iOS, Weigh to Go, e um bloco de anúncio **banner**; ponha-os nos secrets
     `ADMOB_APP_ID` e `ADMOB_BANNER_ID` do environment `app-store`. Os builds do TestFlight mostram
     os anúncios de teste da Google de qualquer jeito; um build para a App Store precisa dos dois.
   - Adicione o seu iPhone como dispositivo de teste (Settings, Test devices), como no Arrows.
   - Em Privacy & messaging, inclua o app numa mensagem de regulamentos europeus (GDPR) e publique-a,
     e numa mensagem de estados dos EUA, se tiver uma. Sem a mensagem explicativa do IDFA: o app
     nunca pede rastreamento.
   - Em Blocking controls, defina a classificação máxima dos anúncios e bloqueie as categorias
     sensíveis que não combinam com um diário de peso (produtos de dieta e emagrecimento, entre
     outras, onde existirem).
   - O `app-ads.txt` já está no jonathas.net para a conta. Quando o app estiver publicado, ligue-o à
     listagem nas configurações do app.
   - Cole numa sessão a lista atual de SKAdNetwork da Google
     (<https://developers.google.com/admob/ios/3p-skadnetworks>): a sessão não consegue abrir essa
     página e não deve digitar os ids de memória.
7. **As páginas no jonathas.net.** No repositório `jonathascosta/jonathas.net`, como no Arrows:
   suporte em `https://www.jonathas.net/weightogo.html` (`/weightogo/pt.html` em português) e a
   política de privacidade em `/weightogo/privacy.html` (`/weightogo/privacidade.html`), copiadas da
   política do app (Sprint 4, story 3). Confira que os quatro endereços abrem.
8. **A listagem.** Primeiro, grave uma vez a App Review Information da versão no App Store Connect
   (sem login necessário, o contato, as notas do passo 11): sem isso o workflow da listagem falha com
   "No data". Depois rode o workflow **App Store listing**: ele envia os textos e as capturas dos dois
   idiomas e não submete nada.
9. **App Privacy.** Responda pelo SDK de anúncios da Google, seguindo o guia da Google
   (<https://developers.google.com/admob/ios/privacy/data-disclosure>), para anúncios não
   personalizados sem rastreamento. O que a pessoa digita e o que o app lê do app Saúde ficam no
   iPhone e não chegam a ninguém, o que as definições da Apple não contam como coletado; as compras
   passam pela Apple. As respostas têm de bater com a política de privacidade.
10. **Classificação etária.** Sem conteúdo censurável, sem conteúdo dos usuários, sem chat, sem
    apostas, sem navegação web. Responda com verdade às perguntas sobre temas de saúde e medicina: o
    app registra peso e mostra estimativas, não dá conselho médico e não oferece tratamento.
    Publicidade: sim.
11. **Revisão e lançamento.**
    - Preço: grátis. Países: todos menos a China continental, onde os apps precisam de um número de
      registro do governo (ICP).
    - Escolha o build do TestFlight para a versão, depois de conferir que foi feito do `main` atual
      (o Arrows 1.0 foi aprovado com um build antigo e precisou de um 1.0.1 na hora). Junte a compra
      dentro do app à versão.
    - **A primeira submissão precisa de uma gravação de tela e das notas de revisão completas**, ou
      um app novo recebe "Guideline 2.1 - Information Needed" em vez de uma revisão (Arrows, 5 de
      outubro de 2026). A gravação começa de uma instalação nova, o que apaga o diário naquele
      iPhone: primeiro exporte um backup (Seus dados, Exportar backup, para o Arquivos), depois
      apague o app, instale-o de novo pelo TestFlight, grave e importe o backup no fim (ou grave em
      outro iPhone). Num iPhone em inglês com o iOS mais recente, comece a gravação de tela pela
      Central de Controle e mostre, devagar: a primeira pesagem, o resumo e um gráfico, um cartão de
      análise, ligar o app Saúde e a tela de permissão, o lembrete, a mensagem de consentimento se
      aparecer, o banner (mostrado, nunca tocado: tocar nos próprios anúncios viola a política do
      AdMob), comprar Remover anúncios no sandbox e Restaurar compras, as configurações e a política
      de privacidade. Dois a quatro minutos; corte as pontas no app Fotos. Cole as
      [notas de revisão](STORE.md#app-review-notes) (em inglês, como a Apple as lê) em Notes da App
      Review Information e anexe a gravação.
    - O status de comerciante (Digital Services Act) é declarado uma vez para a conta (feito para o
      Arrows em 4 de outubro de 2026); nada novo, a menos que a declaração passe para um endereço
      comercial.
    - Submeta. Depois do lançamento, avise a sessão: o site então ganha os links da App Store.

## Antes de cada versão

- Suba a versão no `package.json` e o `MARKETING_VERSION` do projeto Xcode juntos (um teste confere
  que são iguais); uma nova versão menor volta a pedir avaliação.
- Crie antes a nova versão no App Store Connect: o workflow da listagem escreve na versão em
  preparação. Atualize as notas da versão nos dois idiomas.
- Se uma tela das capturas mudou, rode `npm run store:screenshots` e faça commit delas.
- Se o que o app faz com os dados mudou: a política de privacidade (e a data dela), o manifesto de
  privacidade, as respostas do App Privacy e a cópia no jonathas.net, juntos.
- Confira se a lista de SKAdNetwork da Google tem data mais nova que a do `Info.plist`.
- Rode o workflow da listagem, depois o do TestFlight, confira o build contra o `main` e submeta.
