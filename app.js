Vue.component('flat-pickr', VueFlatpickr);
flatpickr.localize(flatpickr.l10ns.pt);

var pacienteTemplateFn = () => JSON.parse(JSON.stringify({ocorrencias: []})) 

var app = new Vue({
  el: '#app',
  data: {
    db: undefined,
    remoteCouchAddr: undefined,
    remoteCouch: undefined,
    loginForm: {
      usuario: '',
      senha: '',
      erro: ''
    },
    usuario: undefined,
    fpconfig: {
      enableTime: true,
      dateFormat: "d-m-Y H:i",
    },
    carregandoPacientes: true,
    pacientes: [],
    mostraPaciente: false,
    paciente: pacienteTemplateFn(),
    formOcorrencia: {
      tipoOcorrencia: '',
      dataOcorrencia: null
    },
    busca: '',
    filtroSituacao: 'Todos',
    syncHandler: undefined
  },
  watch: {
    mostraPaciente: function (val) {
      if(val) {
        this.formOcorrencia.tipoOcorrencia = 'Pendente'
        this.formOcorrencia.dataOcorrencia = this.criaDataAtual()
      }
    }
  },
  methods: {
    logOut() {
      this.remoteCouch.logOut((err, response) => {
        this.usuario = undefined
      })
    },
    verificaSessao () {
      return this.remoteCouch.getSession((err, response) => {
        if (response.userCtx && response.userCtx.name) {
          this.usuario = response.userCtx
          if (!this.syncHandler) {
            this.sincronizarBases()
          }
        } else {
          this.usuario = undefined
          if (this.syncHandler) {
            this.syncHandler.cancel()
          }          
        }
      })
    },
    sincronizarBases() {
      this.syncHandler = this.db.replicate.from(this.remoteCouch).on('complete', (info) => {
        this.updatePacientes()
        this.carregandoPacientes = false
        this.db.sync(this.remoteCouch, {
          live: true,
          retry: true
        }).on('change', (info) => {
          this.updatePacientes()
          //info.change.docs.map(updatePacienteUI)
        }).on('paused', (err) => {
          // replication paused (e.g. replication up to date, user went offline)
        }).on('active', ()  =>{
          // replicate resumed (e.g. new changes replicating, user went back online)
        }).on('denied', (err) => {
          // a document failed to replicate (e.g. due to permissions)
        }).on('error', (err) => {
          // handle error
        });
      })
      return this.syncHandler
    },
    autenticar () {
      return this.remoteCouch.logIn(this.loginForm.usuario, this.loginForm.senha).then( (usuario) => {
        this.usuario = usuario
      })
      .then(this.sincronizarBases)
      .catch((err) => {
        this.loginForm.erro = err.message
      })
    },
    corParaSituacao(situacao) {
      if (situacao.tipoOcorrencia === 'Positivo para Covid-19') {
        return 'is-danger'
      }
      if (situacao.tipoOcorrencia === 'Óbito') {
        return 'is-dark'
      }
      if (situacao.tipoOcorrencia === 'Liberado') {
        return 'is-success'
      }
      return 'is-info'
    },
    removerOcorrencia(ocorrencia) {
      this.paciente.ocorrencias = this.paciente.ocorrencias
        .filter((item) => item.dataOcorrencia !== ocorrencia.dataOcorrencia)
      ;
    },
    dataParaFloat(dataStr) {
      let f = dataStr.split(/[:\ -]/g)
        .map(parseFloat)
      ; 
      return (f[0]*86400)+(f[1]*2629800)+(f[2]*31557600)+(f[3]*60)+(f[4])
    },
    ordenaOcorrencias(ocorrencias) {
      return ocorrencias.sort((a, b) => {
        return this.dataParaFloat(b.dataOcorrencia) - this.dataParaFloat(a.dataOcorrencia)
      })
    },
    criaDataAtual(){
      let d = new Date()
      return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
    },
    novoPaciente() {
      this.paciente = pacienteTemplateFn()
      this.formOcorrencia.dataOcorrencia = this.criaDataAtual()
      this.mostraPaciente = true
    },
    criaOuAtualizaPaciente() {
      // Cria um novo paciente com um novo id
      if (!this.paciente._id) {
        this.paciente._id = new Date().toISOString()
      }
      this.db.put(this.paciente).then((info) => {
        console.log(info)
      }).catch(() => {

      });
    },
    updatePacientes () {
      this.db.allDocs({include_docs: true, descending: true}, (err, result) => {
        this.pacientes = result.rows
      }).then(() => {
        if (this.paciente._id) {
          this.mostraPacienteId(this.paciente._id)
        }
      })
    },
    mostraPacienteId(id) {
      this.paciente = JSON.parse(JSON.stringify(this.pacientes.filter((item) => item.id === id)[0].doc))
      this.formOcorrencia.dataOcorrencia = this.criaDataAtual()
      this.paciente.ocorrencias = this.ordenaOcorrencias(this.paciente.ocorrencias)
      this.mostraPaciente = true
    },
    novaOcorrencia() {
      this.paciente.ocorrencias.push({
        tipoOcorrencia: this.formOcorrencia.tipoOcorrencia,
        dataOcorrencia: this.formOcorrencia.dataOcorrencia
      })
      this.paciente.ocorrencias = this.ordenaOcorrencias(this.paciente.ocorrencias)
      this.formOcorrencia.tipoOcorrencia = 'Pendente'
      this.formOcorrencia.dataOcorrencia = this.criaDataAtual()
    },
    pacienteSituacaoSelecionada(paciente) {
      console.log(paciente)
      if (this.filtroSituacao === 'Todos') return true
      if (!paciente.doc.ocorrencias) return false

      if (paciente.doc.ocorrencias[0].tipoOcorrencia === this.filtroSituacao) {
        return true
      }
      return false
    },

  },
  computed: {
    camposDeBusca () {
      //return 'nome sexo telefone email RG CPF endereco'.split(' ')
      return 'nome RG CPF'.split(' ')
    },
    pacientesFiltro () {
      const buscaLow = this.busca.toLowerCase().trim()
      return this.pacientes.filter((paciente) => {
        
        if (this.busca.trim() == '') return true

        for (var i = this.camposDeBusca.length - 1; i >= 0; i--) {
          var valorDoCampo = paciente.doc[this.camposDeBusca[i]]
          if (!valorDoCampo) continue
          if (valorDoCampo.toLowerCase().indexOf(buscaLow) !== -1) {
            return true
          }
        }
        return false
      }).filter(this.pacienteSituacaoSelecionada)
    },
    situacoes () {
      return ['Positivo para Covid-19','Negativo para Covid-19','Indefinido para Covid-19','Pendente','Óbito','Liberado','Outro']
    },
    quantidadeFiltro () {
      return this.pacientesFiltro.length
    },
  },
  created () {
    this.remoteCouchAddr = window.location.href.split('?base=')[1];
    let remoteCouchAddrSplit = this.remoteCouchAddr.split('/')
    let localCouchAddr = remoteCouchAddrSplit[remoteCouchAddrSplit.length-1]
    if (this.remoteCouchAddr) {
      this.db = new PouchDB(localCouchAddr);
      this.remoteCouchAddr = window.location.href.split('?base=')[1];
      this.remoteCouch = new PouchDB(this.remoteCouchAddr, {skip_setup: true});
      
      this.verificaSessao()
      .then(() => {
          window.setInterval(this.verificaSessao, 100000)
      })
    }
  }
})
