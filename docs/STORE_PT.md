# A App Store

Os passos que só o dono pode dar para colocar o Weigh to Go na App Store, em ordem, com o que já pode
começar. Seguem os do Arrows (`jonathascosta/arrows`, `docs/STORE.md`) e reaproveitam a conta, a chave
da API do App Store Connect e o certificado de distribuição dele. Os mesmos passos estão em inglês em
[STORE.md](STORE.md); uma mudança em um vai para o outro no mesmo pull request. O porquê de o app ser
feito assim está em [decisions.md](decisions.md); o trabalho está planejado no
[sprint 3](sprint-3.md) e no [sprint 4](sprint-4.md).

## O que já pode começar

Os passos 1 a 3 e o 6 não dependem do código, e alguns levam dias para a Apple ou o Google
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
   igual: rodar o workflow, instalar pelo TestFlight, contar o que parece errado. Deixe **For the App
   Store** desmarcado nesses: um build assim não leva nenhum dos seus ids do AdMob, mostra os
   anúncios de teste do Google pelo TestFlight e não mostraria anúncio nenhum na App Store. O passo
   11 precisa de um build de uma execução com ele marcado.
5. **A compra dentro do app.** Em Monetization, In-App Purchases do app, crie um **Non-Consumable**
   com o product id `net.jonathas.weightogo.removeads`, um nome de referência ("Remove ads"), o preço
   que escolher, o nome e a descrição em inglês e português ("Remove ads" · "Pay once and never see
   ads again"; "Remover anúncios" · "Pague uma vez e nunca mais veja anúncios"), se vale para o
   Compartilhamento Familiar, e a captura de tela para a revisão:
   `ios/App/fastlane/screenshots/review/remove-ads.png` neste repositório (1290 × 2796, Seus dados ›
   App para iPhone com "Buy · $2.99"; `npm run build:ios && npm run store:screenshots` a refaz). O App
   Store Connect não submete a compra sem ela. A primeira compra vai junto com a primeira versão
   (passo 11).
   - O **Compartilhamento Familiar** é escolha sua, e pode ser ligado depois, mas nunca mais
     desligado. O app o lê da App Store: ligado, a linha sob o botão acrescenta "e para o seu grupo
     de Compartilhamento Familiar".
   - **Teste no TestFlight, sem comprar,** assim que a compra existir (ela precisa do acordo do
     passo 2; pode levar uma hora para chegar ao sandbox). As compras no TestFlight são gratuitas,
     usam a sua própria Conta Apple e **não podem ser apagadas**: comprado uma vez, essa Conta Apple
     tem Remover anúncios no TestFlight para sempre, e então nada do Google é iniciado no seu
     iPhone,
     de modo que o banner, as Opções de privacidade, a salvaguarda do EEE e quase todo o registro de
     rede do passo 11 não podem mais ser conferidos. Por isso **a compra em si é a última coisa que
     você faz antes de submeter** (passo 11). Agora, em Seus dados › App para iPhone, nesta ordem:
     1. **Remover anúncios** mostra o preço vindo da App Store. Sem preço, a linha diz que não foi
        possível acessar a App Store ou que a opção Remover anúncios não está disponível: a compra
        ainda não está no App Store Connect, ou o id dela é outro.
     2. Toque em **Comprar** e cancele a tela da Apple: volta ao botão, sem mensagem.
     3. Com o preço à vista, em Ajustes › Tempo de Uso › Restrições de Conteúdo e Privacidade,
        proíba as compras dentro de apps e volte ao app: a linha diz que as compras estão
        desativadas, sem botão. Permita de novo e volte: o preço reaparece.
     4. No Modo Avião, toque em **Comprar**: a linha diz que não foi possível acessar a App Store.
        De
        volta on-line, **Tentar de novo** mostra o preço.
     5. Toque em **Restaurar compras**: "Nenhuma compra para restaurar nesta Conta Apple."

     Se preferir comprar antes do passo 11, use uma segunda Conta Apple: adicione-a como outra
     testadora do TestFlight (no App Store Connect, TestFlight, Internal Testing) e compre com ela
     em outro iPhone, ou depois de trocar a conta em Ajustes › seu nome › Mídia e Compras; a sua
     conta continua sem a compra para as conferências do passo 11.

     O Pedir para Comprar ("Aguardando aprovação") precisa de uma conta real de criança numa família
     no TestFlight, ou do arquivo de configuração do StoreKit (`ios/App/Products.storekit`, já
     escolhido no scheme App) com um build feito no Xcode; é opcional, e o teste de StoreKit do
     workflow iOS o cobre.

   - Nada precisa de servidor: o app confere a compra no iPhone com o StoreKit, então não há shared
     secret nem URL de App Store Server Notifications para configurar.
6. **AdMob.**
   - Adicione um app iOS, Weigh to Go, e um bloco de anúncio **banner**; ponha-os nos secrets
     `ADMOB_APP_ID` (o id do app, `ca-app-pub-…~…`) e `ADMOB_BANNER_ID` (o id do bloco,
     `ca-app-pub-…/…`) do environment `app-store`, os dois ou nenhum. Instalado pelo TestFlight, o
     app mostra os anúncios de teste do Google de qualquer jeito (ele reconhece o TestFlight pelo
     recibo de sandbox), então o seu uso nunca conta como tráfego inválido; pela App Store mostra os
     seus. Uma execução do workflow TestFlight com **For the App Store** marcado falha sem os dois;
     só uma execução assim põe os ids no app. Os ids só chegam à verificação do workflow e ao passo
     de assinatura.
   - Adicione o seu iPhone como dispositivo de teste (Settings, Test devices), como no Arrows.
   - Em Privacy & messaging, inclua o app numa mensagem de regulamentos europeus (GDPR) e numa
     mensagem de regulamentos de estados dos EUA (US state regulations), e publique as duas: a
     política de privacidade promete as escolhas em Opções de privacidade no EEE, no Reino Unido, na
     Suíça e nos estados dos EUA cujas leis as dão. Sem a mensagem explicativa do IDFA: o app nunca
     pede rastreamento. **Uma salvaguarda antes do lançamento**, em Portugal, num build do TestFlight
     de uma execução **For the App Store** (qualquer outro build usa o app de teste do Google, cuja
     mensagem de exemplo não prova nada sobre as suas): a partir do 8º dia depois da primeira
     abertura, com uma pesagem no diário, ou a mensagem de GDPR do Google aparece, ou Seus dados ›
     App para iPhone mostra **Opções de privacidade** e ela abre o formulário do Google (essa linha
     só aparece onde as suas mensagens valem). Se nenhum dos dois acontecer, pare o lançamento e
     avise uma sessão: o app estaria mostrando anúncios no EEE sem perguntar.
   - Em Blocking controls, defina a classificação máxima dos anúncios e bloqueie as categorias
     sensíveis que não combinam com um diário de peso (produtos de dieta e emagrecimento, entre
     outras, onde existirem).
   - O `app-ads.txt` já está no jonathas.net para a conta. Quando o app estiver publicado, ligue-o à
     listagem nas configurações do app.
   - Cole numa sessão a lista atual de SKAdNetwork do Google
     (<https://developers.google.com/admob/ios/3p-skadnetworks>), com a data que a página dá: a
     sessão não consegue abrir essa página e não deve digitar os ids de memória. A sessão a põe no
     `SKAdNetworkItems` marcado do `ios/App/App/Info.plist`, com a data; até lá, uma execução **For
     the App Store** falha.
7. **As páginas no jonathas.net.** A política de privacidade fica no site, em
   `https://weightogo.jonathas.net/privacy.html` e `/pt/privacidade.html` em português (e no app,
   pelo rodapé). O contato dela são as issues do projeto no GitHub até você decidir um contato
   privado (um endereço de email) e as páginas de suporte (decisão 63 em
   [decisions.md](decisions.md)); aí a política, a data dela e este passo mudam juntos. No
   repositório `jonathascosta/jonathas.net`, como no Arrows:
   - suporte em `https://www.jonathas.net/weightogo.html` (`/weightogo/pt.html` em português),
     quando você decidir o que ele diz;
   - `/weightogo/privacy.html` e `/weightogo/privacidade.html` como links ou redirecionamentos para
     as duas páginas da política acima, não cópias, para que haja uma só política a manter em dia.

   Confira que os endereços abrem.

8. **A listagem.** Primeiro, grave uma vez a App Review Information da versão no App Store Connect
   (sem login necessário, o contato, as notas do passo 11): sem isso o workflow da listagem falha com
   "No data". Depois rode o workflow **App Store listing**: ele envia os textos e as capturas dos dois
   idiomas e não submete nada. Até você decidir um contato e as páginas de suporte (decisão 63 em
   [decisions.md](decisions.md)), a Support URL em App Information é a página de issues do projeto,
   <https://github.com/jonathascosta/weigh-to-go/issues>, nos dois idiomas.
9. **App Privacy.** Primeiro confira a política de privacidade com a página de divulgação de dados
   do Google (<https://developers.google.com/admob/ios/privacy/data-disclosure>): a sessão não
   consegue abri-la, então cole a página numa sessão (ou compare você mesmo). O "Anúncios no app" da
   política diz que o SDK coleta o endereço IP, o modelo e o sistema do aparelho, o IDFV, dados de
   publicidade e interações com os anúncios, uma localização aproximada obtida do IP e dados de
   falhas e de desempenho (`privacy.ads.collects`); onde a página disser outra coisa, a sessão muda a
   política e a data dela. Depois responda pelo SDK de anúncios do Google, seguindo essa página, para
   anúncios não personalizados sem rastreamento. O que a pessoa digita e o que o app lê do app Saúde ficam no
   iPhone e não chegam a ninguém, o que as definições da Apple não contam como coletado; as compras
   passam pela Apple. As respostas têm de bater com a política de privacidade. A Privacy Policy URL
   (App Privacy) é `https://weightogo.jonathas.net/privacy.html`, e
   `https://weightogo.jonathas.net/pt/privacidade.html` na localização em português (Brasil).
10. **Classificação etária.** Sem conteúdo censurável, sem conteúdo dos usuários, sem chat, sem
    apostas, sem navegação web. Responda com verdade às perguntas sobre temas de saúde e medicina: o
    app registra peso e mostra estimativas, não dá conselho médico e não oferece tratamento.
    Publicidade: sim.
11. **Revisão e lançamento.**
    - Preço: grátis. Países: todos menos a China continental, onde os apps precisam de um número de
      registro do governo (ICP).
    - Escolha o build do TestFlight para a versão, depois de conferir que foi feito do `main` atual
      (o Arrows 1.0 foi aprovado com um build antigo e precisou de um 1.0.1 na hora) e por uma
      execução com **For the App Store** marcado (a página da execução na aba Actions mostra as
      entradas dela). Junte a compra dentro do app à versão.
    - **Antes do lançamento, confira que o app não envia nada ao Google quando não deve.** Num build
      do TestFlight de uma execução **For the App Store**, com um registro de rede, veja que não há
      nenhum pedido ao Google (`*.google.com`, `*.googleapis.com`, `*.doubleclick.net`,
      `*.googlesyndication.com`, `app-measurement.com` e afins) em cada um destes estados: uma
      instalação nova nos 7 primeiros dias, com pesagens; uma recusa na mensagem do Google; e, numa
      mesma sessão, depois de retirar o consentimento em Opções de privacidade. Os estados com
      Remover anúncios (comprado durante uma sessão, depois já comprado na abertura seguinte) vêm
      por último, junto com a própria compra (o último item abaixo). A primeira ferramenta é o
      próprio **Relatório de Privacidade dos Apps** do iPhone (Ajustes › Privacidade e Segurança › Relatório de Privacidade dos Apps, ligado
      antes do teste): ele lista cada domínio que cada app contatou, então cobre os estados que
      atravessam uma abertura (os primeiros dias, uma recusa, a compra feita). Para os estados numa
      mesma sessão, use um proxy (no Mac de um amigo, como o Proxyman ou o Charles) ou o modelo
      Network do Instruments, que mostram quando cada pedido foi feito. Se algum aparecer, pare o
      lançamento e avise uma sessão.
    - **Primeiro o trecho do banner, na instalação que você usa.** A gravação abaixo começa de uma
      instalação nova, e reinstalar recomeça os 7 primeiros dias (um backup não os leva), então o
      banner só aparece nessa instalação depois de uma semana. Antes de apagar o app, numa
      instalação em uso há 7 dias ou mais (ou em outro iPhone que tenha uma), grave um trecho curto
      do diário com o banner no topo (mostrado, nunca tocado: tocar nos próprios anúncios viola a
      política do AdMob) e de Seus dados, App para iPhone, **Opções de privacidade**, com o
      formulário do Google aberto: o Google mostra a mensagem de consentimento uma vez por
      instalação, então o formulário faz as vezes dela.
    - **A primeira submissão precisa de uma gravação de tela e das notas de revisão completas**, ou
      um app novo recebe "Guideline 2.1 - Information Needed" em vez de uma revisão (Arrows, 5 de
      outubro de 2026). A gravação começa de uma instalação nova, o que apaga o diário naquele
      iPhone: primeiro exporte um backup (Seus dados, Exportar backup, para o Arquivos), depois
      apague o app, instale-o de novo pelo TestFlight, grave e importe o backup no fim (ou grave em
      outro iPhone). Num iPhone em inglês com o iOS mais recente, comece a gravação de tela pela
      Central de Controle e mostre, devagar: a primeira pesagem, o resumo e um gráfico, um cartão de
      análise, ligar o app Saúde e a tela de permissão, o lembrete, Remover anúncios com o preço e
      Restaurar compras ("Nenhuma compra para restaurar nesta Conta Apple."; nada foi comprado
      ainda), as configurações e a política de privacidade. Dois a quatro minutos; corte as pontas
      no app Fotos. Com o trecho do banner e o trecho da compra (o último item abaixo), ela vai com
      as [notas de revisão](STORE.md#app-review-notes).
    - O status de comerciante (Digital Services Act) é declarado uma vez para a conta (feito para o
      Arrows em 4 de outubro de 2026); nada novo, a menos que a declaração passe para um endereço
      comercial.
    - A salvaguarda do EEE do passo 6, num build do TestFlight de uma execução **For the App
      Store**, em Portugal: a partir do 8º dia com uma pesagem, a mensagem de GDPR do Google
      apareceu, ou Opções de privacidade apareceu em Seus dados › App para iPhone e abriu o
      formulário do Google. Se nenhum dos dois aconteceu, não submeta.
    - **Por último, a compra, gravada e registrada.** Tudo acima precisa de Remover anúncios não
      comprado, então isto vem depois de tudo. Numa instalação com mais de 7 dias, com o banner no
      topo (a gravação acima recomeça os 7 dias no iPhone de onde ela apaga o app, então faça-a em
      outro iPhone, ou guarde uma instalação intacta para isto), ligue o proxy ou o modelo Network
      do Instruments e a gravação de tela, e então em Seus dados › App para iPhone toque em
      **Comprar** e confirme: o banner some na hora, a linha diz "Anúncios removidos. Obrigado." e o
      registro não mostra nenhum pedido novo ao Google a partir daí. Feche o app e abra de novo:
      nenhum anúncio, e nenhum pedido ao Google (o Relatório de Privacidade dos Apps concorda).
      Depois apague o app e instale de novo: Seus dados diz "Anúncios removidos. Obrigado." ao
      abrir, e **Restaurar compras** diz "Compra restaurada.". A gravação é o trecho da compra. Cole
      as [notas de revisão](STORE.md#app-review-notes) (em inglês, como a Apple as lê) em Notes da
      App Review Information e anexe a gravação, o trecho do banner e o trecho da compra.
    - Submeta. Depois do lançamento, avise a sessão: o site então ganha os links da App Store.

## Antes de cada versão

- Suba a versão no `package.json` e o `MARKETING_VERSION` do projeto Xcode juntos (um teste confere
  que são iguais); uma nova versão menor volta a pedir avaliação.
- Crie antes a nova versão no App Store Connect: o workflow da listagem escreve na versão em
  preparação. Atualize as notas da versão nos dois idiomas.
- Se uma tela das capturas mudou, rode `npm run store:screenshots` e faça commit delas.
- Se o que o app faz com os dados mudou: a política de privacidade (e a data dela), o manifesto de
  privacidade e as respostas do App Privacy, juntos.
- Confira se a lista de SKAdNetwork do Google tem data mais nova que a do `Info.plist`.
- Rode o workflow da listagem, depois o do TestFlight, confira o build contra o `main` e submeta.
