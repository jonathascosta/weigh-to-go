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
   - Depois, no App Store Connect, Apps, +, New App: iOS, o nome **Weigh to Go**, idioma principal
     English (U.S.), o bundle id `net.jonathas.weightogo`, SKU `net.jonathas.weightogo`, acesso
     completo. **O nome é conferido aqui**: o App Store Connect recusa um nome que outro app já usa.
     Uma sessão não conseguiu buscar na App Store (22 de outubro de 2026: a busca da Apple estava
     fora do alcance da sessão; uma busca na web não achou nenhum app com esse nome, só o
     "Weigh2Go", um app de iPad para balanças industriais). Se ele for recusado, use a alternativa,
     **Weigh to Go: Weight Diary** (25 caracteres, a mesma nos dois idiomas), e avise uma sessão:
     ela muda o `name.txt` em `ios/App/fastlane/metadata/en-US` e `pt-BR`, o subtítulo em inglês
     para "See the real trend" (o atual repetiria "Weight Diary") e o teste da listagem (decisão
     164).
     **Feito em 22 de outubro de 2026:** você criou o app como **Weigh to Go: Weight Diary**; a
     listagem leva esse nome e o subtítulo em inglês "See the real trend" (decisão 175).
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
   não usa nenhum, e os workflows do TestFlight e da listagem (App Store listing) rodam só no `main`,
   à mão.

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
     de Compartilhamento Familiar". A captura de tela para a revisão neste repositório o mostra
     ligado; se deixá-lo desligado, mude `isFamilyShareable` para `false` em
     `scripts/store-screenshots.mjs` e refaça a captura com o comando acima.
   - **Teste no TestFlight, sem comprar,** assim que a compra existir (ela precisa do acordo do
     passo 2; pode levar uma hora para chegar ao sandbox). As compras no TestFlight são gratuitas,
     usam a sua própria Conta Apple e **não podem ser apagadas**: comprado uma vez, essa Conta Apple
     tem Remover anúncios no TestFlight para sempre, e então nada do Google é iniciado no seu
     iPhone, de modo que o banner, as Opções de privacidade, a salvaguarda do EEE e quase todo o registro de
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
        De volta on-line, **Tentar de novo** mostra o preço.
     5. Toque em **Restaurar compras**: "Nenhuma compra para restaurar nesta Conta Apple."

     Se preferir comprar antes do passo 11, use uma segunda Conta Apple: adicione-a como outra
     testadora do TestFlight (no App Store Connect, TestFlight, Internal Testing) e compre com ela
     em outro iPhone com essa conta; a sua conta continua sem a compra para as conferências do
     passo 11.

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
     mensagem de exemplo não prova nada sobre as suas): a partir do 4º dia depois da primeira
     abertura, com uma pesagem no diário, ou a mensagem de GDPR do Google aparece, ou Seus dados ›
     App para iPhone mostra **Opções de privacidade** e ela abre o formulário do Google (essa linha
     só aparece onde as suas mensagens valem). Se nenhum dos dois acontecer, pare o lançamento e
     avise uma sessão: o app estaria mostrando anúncios no EEE sem perguntar.
   - Em Blocking controls, defina a classificação máxima dos anúncios como **PG** no máximo (G é
     mais restrita), para combinar com o 13+ do app (passo 10). As categorias sensíveis são escolha
     sua: em 22 de outubro de 2026 você decidiu não bloquear nenhuma por enquanto, produtos de
     emagrecimento inclusive, já que quem usa o app pode querer essa ajuda (decisão 176); cada uma
     bloqueada baixa um pouco a receita.
   - O `app-ads.txt` já está no jonathas.net para a conta. Quando o app estiver publicado, ligue-o à
     listagem nas configurações do app (passo 12).
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

8. **A listagem.** O texto dela está em `ios/App/fastlane/metadata` (`en-US` e `pt-BR`: nome,
   subtítulo, palavras-chave, descrição, texto promocional, os endereços da privacidade, do suporte
   e do site; ao lado, a categoria, Health & Fitness (Saúde e fitness), e o copyright), e as
   capturas em `ios/App/fastlane/screenshots/en-US` e `pt-BR`: seis telas de um diário inventado, cada
   uma sob uma legenda (`scripts/store-captions.json`), em 1290 × 2796, o tamanho do iPhone de 6,9 polegadas, a partir das quais o App Store Connect faz as
   menores (decisões 165 e 166). Um teste de unidade mantém o texto dentro dos limites da Apple.
   - **Leia antes**, nos dois idiomas, no GitHub: a descrição e o texto promocional dizem o que o
     app faz, citam o Apple Health (app Saúde), chamam as projeções e a composição corporal de
     estimativas, não orientação médica, dizem que os dados ficam no iPhone, sem conta, e que
     Remover anúncios é uma compra única. Peça qualquer mudança a uma sessão;
     `npm run build:ios && npm run store:screenshots` refaz as capturas depois que uma tela muda.
   - Grave uma vez a App Review Information da versão no App Store Connect (sem login necessário, e
     o contato: o seu nome, telefone e email): sem isso a listagem falha com "No data". As notas
     vêm deste repositório: a listagem envia as [notas de revisão](#as-notas-de-revisão) de
     `ios/App/fastlane/metadata/review_information/notes.txt` para o campo Notes a cada execução, e
     deixa o contato como você o gravou; também desliga "Sign-in required"
     (`demo_account_required = false`), já que não há conta de demonstração (decisão 169).
   - Rode o workflow **App Store listing** na aba Actions, no `main`. Ele só precisa da chave da API
     do App Store Connect do passo 3, do ambiente `app-store`. Ele confere o texto de novo, depois o
     `fastlane listing` envia os textos e as capturas dos dois idiomas (acrescentando a localização
     Portuguese (Brazil) se ela não existir, e substituindo as capturas que já estiverem lá) e as
     notas de revisão, sem build, e não submete nada. Ele também põe a versão em **Manually release this version**
     (lançamento manual), a cada execução, seja o que for que estiver escolhido no App Store
     Connect: o lançamento é seu, depois do passo 11 (decisão 167). De um Mac, em vez disso, com os três valores
     `APP_STORE_CONNECT_API_KEY_*` no ambiente:
     `cd ios/App && bundle install && bundle exec fastlane listing`.
   - Depois confira no App Store Connect: as duas localizações mostram o texto e seis capturas para
     a tela de 6,9 polegadas, a categoria é Health & Fitness, e nada está esperando revisão. A
     captura de revisão da compra dentro do app (passo 5) não faz parte da listagem.

   Até você decidir um contato e as páginas de suporte (decisão 63 em [decisions.md](decisions.md)),
   a Support URL é a página de issues do projeto, <https://github.com/jonathascosta/weigh-to-go/issues>,
   nos dois idiomas; a listagem a envia.

9. **App Privacy.** Primeiro confira a política de privacidade com a página de divulgação de dados
   do Google (<https://developers.google.com/admob/ios/privacy/data-disclosure>): a sessão não
   consegue abri-la, então cole a página numa sessão (ou compare você mesmo). O "Anúncios no app" da
   política diz que o SDK coleta o endereço IP, o modelo e o sistema do aparelho, o IDFV, dados de
   publicidade e interações com os anúncios, outros dados de uso do app (quando ele é aberto e onde
   a pessoa toca), uma localização aproximada obtida do IP e dados de falhas e de desempenho
   (`privacy.ads.collects`); onde a página disser outra coisa, a sessão muda a política e a data
   dela. Depois responda pelo SDK de anúncios do Google, seguindo essa página, para anúncios não
   personalizados sem rastreamento. A página do Google diz quais dados ficam ligados à pessoa: os
   registros de falhas não, os dados de desempenho sim. O ID do aparelho vai ao Google com os dados
   de desempenho, então também é declarado ligado à pessoa, a resposta mais segura (sua escolha no
   App Store Connect, 22 de outubro de 2026; decisão 179). Para cada tipo abaixo, Used for
   tracking: No, e Linked to the user's identity como a tabela diz:

   | Categoria › tipo                                         | Linked to the user | Propósitos                                            |
   | -------------------------------------------------------- | ------------------ | ----------------------------------------------------- |
   | Location › Coarse Location (do endereço IP)              | Não                | Third-Party Advertising, Analytics                    |
   | Identifiers › Device ID                                  | **Sim**            | Third-Party Advertising, Analytics                    |
   | Usage Data › Product Interaction                         | Não                | Third-Party Advertising, Analytics                    |
   | Usage Data › Advertising Data                            | Não                | Third-Party Advertising, Analytics                    |
   | Diagnostics › Crash Data ("non-user related crash logs") | Não                | App Functionality, Third-Party Advertising, Analytics |
   | Diagnostics › Performance Data ("user-associated")       | **Sim**            | Third-Party Advertising, Analytics                    |

   Nada mais: nem Other Diagnostic Data (a página não o lista), Health & Fitness, Contact Info, User
   Content, User ID ou Purchases. O que a pessoa digita e o que o app lê do app Saúde ficam no
   iPhone e não chegam a ninguém, o que as definições da Apple não contam como coletado; as compras
   passam pela Apple. As respostas têm de bater com a política de privacidade. A Privacy Policy URL
   (App Privacy) é `https://weightogo.jonathas.net/privacy.html`, e
   `https://weightogo.jonathas.net/pt/privacidade.html` na localização em português (Brasil).

10. **Classificação etária.** No App Store Connect, App Information, Age Rating, Edit. O
    questionário como é feito hoje (as classificações de julho de 2025: 4+, 9+, 13+, 16+ e 18+),
    com as respostas para este app (decisão 170):
    - **In-app controls and capabilities (controles e recursos):** Parental Controls e Age
      Assurance: não (deixe os dois desmarcados).
    - **Capabilities (recursos):** Unrestricted Web Access (acesso livre à web): **No** (o app só
      mostra as próprias páginas; um link para outro site abre o Safari). User-Generated Content
      (conteúdo dos usuários): **No**. Messaging and Chat: **No**. Social media: **No**.
      Advertising (publicidade): **Yes** (o banner).
    - **Temas adultos, sexualidade e nudez, violência:** Profanity or Crude Humor; Horror or Fear
      Themes; Alcohol, Tobacco or Drug Use or References; Mature or Suggestive Themes; Sexual
      Content or Nudity; Graphic Sexual Content and Nudity; Cartoon or Fantasy Violence; Realistic
      Violence; Prolonged Graphic or Sadistic Realistic Violence; Guns or Other Weapons: todos
      **None**.
    - **Medicina e bem-estar:** Medical or Treatment Information (informação médica ou de
      tratamento): **Infrequent**. O app não dá diagnóstico, remédio, tratamento nem conselho, e
      as projeções e a composição corporal são estimativas sem categorias nem metas; mas o cartão
      do IMC põe o IMC da pessoa nas faixas da OMS para adultos (de Abaixo do peso a Obesidade grau
      III) e mostra o peso no limite de cada faixa ("Peso para IMC abaixo de 25", "faltam …"),
      com a ressalva de que o IMC é uma medida aproximada, de população. Isso é informação de saúde
      sobre a pessoa, de vez em quando. Health or Wellness Topics (temas de saúde ou bem-estar):
      **Yes** (um diário de peso com meta é um tema de bem-estar, como os exemplos da Apple de
      contar calorias e fazer dieta).
    - **Chance-based activities (atividades de sorte):** Simulated Gambling e Contests: **None**;
      Gambling e Loot Boxes: **No**.
    - **Age categories and override:** **Not Applicable** (não é Made for Kids, sem classificação
      mais alta), e sem Age Suitability URL.

    **Resultado esperado: 13+**, pela informação médica Infrequent (os temas de saúde ou bem-estar
    sozinhos dão 9+, a publicidade 4+). Se o App Store Connect mostrar outra coisa, pare e avise
    uma sessão antes de submeter. Você pode responder None, para 9+, se não considerar as faixas do
    IMC informação médica (decisão 170); aí o item 8 do passo 11 confere 9+. As classificações
    regionais (a do Brasil, a da Coreia e a da Austrália, entre outras) decorrem das mesmas
    respostas; confira-as na mesma página.

11. **Revisão e submissão.** Nesta ordem: tudo o que precisa de Remover anúncios não comprado vem
    antes da compra, que vem por último, logo antes de submeter. Dois jeitos de passar dos 3
    primeiros dias (sem anúncios antes deles, decisão 177): **a instalação em uso**, que guarda
    os seus dias quando cada build novo é instalado por cima dela como atualização do TestFlight;
    ou **a data adiantada**: com uma pesagem no diário, em Ajustes › Geral › Data e Hora desligue Ajustar
    Automaticamente e adiante a data em 4 dias, feche o app no seletor de apps e abra de novo.
    Ligue Ajustar Automaticamente de novo depois, e antes de qualquer compra (o sandbox precisa da
    data certa): o banner some na volta seguinte ao app, porque os dias são contados de novo a
    partir da data verdadeira. Abra uma instalação nova pela primeira vez com a data certa: uma
    primeira abertura gravada com a data adiantada fica depois de hoje quando a data volta, e o app
    então recomeça os 3 dias a partir desse momento (`src/ads/ads.ts`).
    1. **Preço e países.** Preço: grátis. Países: todos menos a China continental, onde os apps
       precisam de um número de registro do governo (ICP).
    2. **O build, do `main` atual.** Rode o workflow **TestFlight** no `main` com **For the App
       Store** marcado (qualquer outro build não leva nenhum dos seus ids do AdMob). A página da
       execução na aba Actions termina com um resumo: a versão (1.0.0), o número do build, o commit
       de que ele foi feito e um link que compara esse commit com a ponta do `main` (decisão 171). O
       App Store Connect mostra o mesmo build como "1.0.0 (número do build)" quando ele termina de
       ser processado. Instale-o pelo TestFlight como atualização por cima da instalação que você
       usa, que guarda o diário e os dias dela. Use este build em todas as conferências e gravações
       abaixo, e escolha-o no item 7. (O Arrows 1.0 foi aprovado com um build antigo e precisou de
       um 1.0.1 na hora.)
    3. **Confira que o app não envia nada ao Google quando não deve**, na instalação em uso. Com um
       registro de rede, veja que não há nenhum pedido ao Google (`*.google.com`,
       `*.googleapis.com`, `*.doubleclick.net`, `*.googlesyndication.com`, `app-measurement.com` e
       afins) depois de uma recusa na mensagem do Google e, numa mesma sessão, depois de retirar o
       consentimento em Opções de privacidade. Os 3 primeiros dias são conferidos na instalação nova
       do item 5, e os estados com Remover anúncios (comprado durante uma sessão, depois já
       comprado na abertura seguinte) vêm por último, junto com a própria compra (item 9). A
       primeira ferramenta é o próprio **Relatório de Privacidade dos Apps** do iPhone (Ajustes ›
       Privacidade e Segurança › Relatório de Privacidade dos Apps, ligado antes do teste): ele
       lista cada domínio que cada app contatou, então cobre os estados que atravessam uma abertura
       (os primeiros dias, uma recusa, a compra feita). Para os estados numa mesma sessão, use um
       proxy (no Mac de um amigo, como o Proxyman ou o Charles) ou o modelo Network do Instruments,
       que mostram quando cada pedido foi feito. Se algum aparecer, pare o lançamento e avise uma
       sessão. Depois, **a salvaguarda do EEE** do passo 6, em Portugal, depois dos 3 primeiros
       dias (a instalação em uso, ou a data adiantada): a mensagem de GDPR do Google apareceu, ou
       Opções de privacidade apareceu em Seus dados › App para iPhone e abriu o formulário do
       Google. Se nenhum dos dois aconteceu, não submeta.
    4. **O trecho do banner, na instalação em uso.** A gravação abaixo começa de uma instalação
       nova, e reinstalar recomeça os 3 primeiros dias (um backup não os leva). Antes de apagar o
       app, grave um trecho curto do diário com o banner no topo (mostrado, nunca tocado: tocar nos
       próprios anúncios viola a política do AdMob) e de Seus dados, App para iPhone, **Opções de
       privacidade**, com o formulário do Google aberto: o Google mostra a mensagem de
       consentimento uma vez por instalação, então o formulário faz as vezes dela.
    5. **A gravação de tela, numa instalação nova.** A primeira submissão de um app novo precisa
       dela e das notas de revisão completas, ou recebe "Guideline 2.1 - Information Needed" em vez
       de uma revisão (Arrows, 5 de outubro de 2026). Uma instalação nova apaga o diário naquele
       iPhone: primeiro exporte um backup (Seus dados, Exportar backup, para o Arquivos), depois
       apague o app, instale-o de novo pelo TestFlight e abra-o com a data certa. Num iPhone em
       inglês com o iOS mais recente, comece a gravação de tela pela Central de Controle e mostre,
       devagar, um segundo antes de cada toque: as linhas de exemplo das notas coladas em Your data
       › Weigh-ins › Paste several days at once (Seus dados › Pesagens › Colar vários dias de uma
       vez), depois a pesagem de hoje, o resumo e um gráfico, um cartão de análise, ligar o app
       Saúde e a tela de permissão, o lembrete, Remover anúncios com o preço e Restaurar compras
       ("No purchase to restore for this Apple Account."; nada foi comprado ainda), as
       configurações e a política de privacidade. Dois a quatro minutos; corte as pontas no app
       Fotos. Depois, com o Relatório de Privacidade dos Apps, use esta instalação por um dia ou
       mais dentro dos 3 primeiros dias: ela não contata nenhum domínio do Google.
    6. **O caminho do revisor até o banner.** Na mesma instalação nova, com as pesagens, siga as
       notas: a data 4 dias adiantada, o app fechado no seletor e aberto de novo: o banner de teste
       do Google aparece no topo (em Portugal, antes a mensagem do Google). Olhe-o com atenção, já
       que ninguém viu ainda o banner adaptativo num iPhone (decisão 179): ele ocupa a largura toda,
       logo abaixo da barra de status, e a barra do "Weigh to Go" começa logo abaixo dele, sem faixa
       vazia entre os dois e sem nada da barra coberto; fechado no seletor e aberto de novo, a
       página não pula quando o banner chega. Ligue Ajustar Automaticamente de novo. Se nenhum
       banner aparecer, ou se ele deixar uma faixa vazia, cobrir a barra ou a página pular, não
       submeta: avise uma sessão, com uma captura de tela. Depois importe o seu backup (Seus dados,
       Importar backup, Substituir tudo), ou guarde esta instalação de lado se for gravar o item 9
       em outro iPhone.
    7. **Escolha o build.** Na página da versão, Build, adicione o build do item 2. Antes de salvar,
       abra o link de comparação no resumo da execução dele: "There isn't anything to compare"
       quer dizer que o `main` não andou desde então, e o build é o `main` atual. Se o `main` andou,
       a página lista os arquivos mudados desde então: uma mudança só em `docs/` ou na listagem
       (`ios/App/fastlane/metadata`, `ios/App/fastlane/screenshots`) deixa o app como foi feito;
       qualquer outro arquivo pede um build novo (item 2) e as conferências de novo, então avise uma
       sessão. Junte a compra dentro do app à versão. Deixe o lançamento em **Manually release this
       version** (o workflow da listagem já o põe assim): depois de aprovada, você mesmo lança a
       versão (passo 12).
    8. **A classificação etária** do passo 10 está gravada e mostra 13+ (ou 9+, se você respondeu
       None).
    9. **Por último, a compra, gravada e registrada.** Tudo acima precisa de Remover anúncios não
       comprado, então isto vem depois de tudo. Ela precisa do banner na tela e da data certa para o
       sandbox, então faça-a numa instalação que passou de verdade dos 3 primeiros dias (a que está
       em uso, se a instalação nova do item 5 foi em outro iPhone, ou outro iPhone que tenha uma,
       ou a instalação do item 5, depois de passados 3 dias desde que ela foi aberta pela primeira
       vez com a data certa):
       com a data adiantada, o banner some assim que a data volta ao certo, antes que a compra
       possa mostrá-lo sumindo. Ligue o proxy ou o modelo Network do Instruments e a gravação de
       tela, e então em Seus dados › App para iPhone toque em **Comprar** e confirme: o banner some
       na hora, a linha diz "Anúncios removidos. Obrigado." e o registro não mostra nenhum pedido
       novo ao Google a partir daí. Feche o app e abra de novo: nenhum anúncio, e nenhum pedido ao
       Google (o Relatório de Privacidade dos Apps concorda). Depois apague o app e instale de novo:
       Seus dados diz "Anúncios removidos. Obrigado." ao abrir, e **Restaurar compras** diz "Compra
       restaurada.". A gravação é o trecho da compra.
    10. **As notas de revisão e os anexos.** Rode o workflow **App Store listing** mais uma vez
        (passo 8): ele põe as [notas de revisão](#as-notas-de-revisão) em Notes da App Review
        Information da versão. Confira que estão lá, inteiras, e anexe a gravação, o trecho do
        banner e o trecho da compra (Attachment). Uma gravação grande demais para anexar vai como
        link compartilhado (iCloud Drive ou Google Drive) no fim das notas, digitado no App Store
        Connect; a próxima execução da listagem o apaga, então acrescente-o por último.
    11. **O status de comerciante** (Digital Services Act) é declarado uma vez para a conta (feito
        para o Arrows em 4 de outubro de 2026); nada novo, a menos que a declaração passe para um
        endereço comercial.
    12. **Submeta** (Add for Review, depois Submit to App Review). Se a App Review responder
        "Guideline 2.1 - Information Needed" mesmo assim, responda à mensagem dela (App Review na
        barra lateral do app) com as mesmas notas e as gravações, e submeta de novo se a versão
        aparecer como Rejected.
12. **Depois da aprovação.**
    - **Lance** a versão você mesmo (Release This Version), quando quiser.
    - **O id na App Store.** App Store Connect, App Information, General Information, **Apple ID**
      (só dígitos). Avise uma sessão, ou ponha-o em `APP_STORE_ID` em `scripts/app-store.mjs` num
      pull request: depois de integrado e publicado pelo workflow Website, cada página do site ganha
      o Smart App Banner do Safari e um link "Na App Store" no rodapé, e o Sobre do site uma linha
      com o link do app; o app para iPhone não mostra nenhum dos dois (decisão 173). Confira num
      iPhone, no Safari, em <https://weightogo.jonathas.net/>: o banner aparece no topo (o Safari o
      esconde depois de fechado, e no iPhone com o app instalado ele diz Abrir).
    - **AdMob:** nas configurações do app, ligue o app à listagem dele na App Store (passo 6), para
      o AdMob conferir o `app-ads.txt` e servir os seus anúncios por inteiro.
    - **jonathas.net:** o cartão do Weigh to Go e o artigo dele ficam no repositório
      `jonathascosta/jonathas.net`; acrescente-os lá, com o link da App Store, quando quiser (numa
      sessão daquele repositório).

## As notas de revisão

As respostas que a App Review pede de um app novo (Guideline 2.1, a partir das do Arrows) estão em
inglês, como a App Review as lê, em [STORE.md](STORE.md#app-review-notes) e em
`ios/App/fastlane/metadata/review_information/notes.txt`, que o workflow da listagem envia como as
notas da App Review Information da versão (passo 8). Um teste as mantém abaixo dos 4.000 caracteres
do App Store Connect, confere que elas citam os controles do app como o app em inglês os chama, que
as linhas de exemplo são coladas sem erro e que a cópia do STORE.md é o mesmo texto (decisão 169).
Peça qualquer mudança a uma sessão; as duas mudam juntas. Em resumo, elas dizem, em oito partes:

1. **A gravação de tela:** anexada, de uma instalação nova, com os dois trechos de uma instalação
   que passou dos 3 primeiros dias (o banner com as Opções de privacidade e a compra); sem conta,
   login nem conteúdo dos usuários.
2. **Propósito e público:** um diário de peso para adultos, com a tendência, as projeções, as médias
   semanais, os repiques, o IMC e as estimativas de composição corporal, em inglês ou português do
   Brasil; os dados ficam no iPhone.
3. **Como usar:** as quatro abas; **primeiro os dados de exemplo**: quinze dias inventados de
   outubro de 2026 (duas semanas inteiras e um dia, para os cartões que comparam duas semanas), em
   kg, para colar em Your data › Weigh-ins › Paste several days at once e Import lines (o app já lê
   várias linhas de uma vez: nada novo foi construído para isso); depois a pesagem de hoje em
   Today; e Your data na ordem da tela: Weigh-ins, Backup, Settings, iPhone app (o lembrete, o app
   Saúde, Remove ads, Restore purchases, Privacy choices onde vale) e About.
4. **App Saúde (HealthKit):** lê e grava só a massa corporal, depois que a pessoa liga "Use Apple
   Health" e permite; nada do Saúde sai do iPhone nem serve para anúncios.
5. **Anúncios e consentimento:** um banner no topo, só não personalizados, sem pedido de
   rastreamento (ATT), sem IDFA, sem pesagens para o SDK; nada nos 3 primeiros dias nem com o
   diário vazio, e nenhum contato com o Google até lá; **para ver o banner numa instalação nova**:
   registrar uma pesagem, desligar Ajustar Automaticamente e adiantar a data em 4 dias (Ajustes,
   Geral, Data e Hora), fechar o app no seletor de apps e abrir de novo, e religar Ajustar
   Automaticamente antes de tentar Remove ads; com um recibo de
   sandbox (TestFlight, App Review) o app mostra os anúncios de teste do Google; a mensagem do UMP
   no EEE, no Reino Unido e na Suíça, e uma recusa quer dizer sem anúncios e sem SDK.
6. **A compra:** Remove ads, não consumível, em Your data › iPhone app, Buy, que funciona com uma
   conta de sandbox; comprada, o banner some e o SDK e o UMP não são mais iniciados; Restore
   purchases logo abaixo; StoreKit 2 no aparelho, sem servidor.
7. **Diferenças regionais:** o mesmo app em todas as regiões onde é oferecido (todas menos a China
   continental); as unidades seguem a região; só a mensagem de consentimento muda.
8. **Conteúdo regulado e alegações médicas:** não é dispositivo médico nem de setor regulado; as
   projeções e a composição corporal são estimativas de fórmulas publicadas, sem categorias nem
   metas; o IMC mostra as faixas da OMS para adultos, em qual delas o IMC da pessoa está e o peso
   no limite de cada faixa, com a ressalva de que o IMC é uma medida aproximada, de população; sem
   conselho nem tratamento: estimativas, não orientação médica. E, no fim, os endereços da política
   de privacidade nos dois idiomas e do suporte.

## Antes de cada versão

- Suba a versão (a primeira é a 1.0.0) com `npm version <x.y.z> --no-git-tag-version`, que muda o
  `package.json` e o `package-lock.json`, e o `MARKETING_VERSION` do projeto Xcode juntos (um teste
  confere que os três são iguais); uma nova versão menor volta a pedir avaliação. O número do build
  não precisa de nada: cada execução do TestFlight dá o seu (número da execução × 100 + tentativa,
  decisão 172).
- Crie antes a nova versão no App Store Connect: o workflow da listagem escreve na versão em
  preparação. A partir da segunda versão, acrescente as notas da versão nos dois idiomas
  (`release_notes.txt` em `ios/App/fastlane/metadata/en-US` e `pt-BR`; a primeira versão não tem
  notas, e o teste da listagem diz isso até lá).
- Se uma tela das capturas mudou, rode `npm run store:screenshots` e faça commit delas.
- Se o que o app faz com os dados mudou: a política de privacidade (e a data dela), o manifesto de
  privacidade e as respostas do App Privacy, juntos.
- Confira se a lista de SKAdNetwork do Google tem data mais nova que a do `Info.plist`.
- Se o que as notas de revisão descrevem mudou (o nome de uma tela, os anúncios, a compra), peça a
  uma sessão para mudar o `notes.txt` e a cópia do STORE.md juntos.
- Rode o workflow da listagem, depois o do TestFlight, confira o build contra o `main` (passo 11,
  itens 2 e 7) e submeta.
