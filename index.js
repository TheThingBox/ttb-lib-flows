const axios = require('axios')
const uuid = require('uuid/v4')
const randomWord = require("random-words")
const Locker = require('async-lock')

var Libflows = function(options = {}){
  this.id = uuid()
  this.locker = new Locker()

  this.nodered = {
    protocol: options.protocol || 'http',
    host: options.host || '127.0.0.1',
    port: options.port || 80
  }
  this.nodered.url = `${this.nodered.protocol}://${this.nodered.host}:${this.nodered.port}`
}

Libflows.prototype.getFlowFromNode = function(node = {}){
  if(!node || Object.keys(node).length === 0){
    return Promise.reject()
  }
  return new Promise( (resolve, reject) => {
    this.locker.acquire(this.id, ()=> {
      return axios.get(`${this.nodered.url}/flows`)
    })
    .then(resp => {
      if(resp.data){
        try{
          resp.data = JSON.parse(resp.data)
        } catch(e){}
        var flow = null
        const nodeIndex = resp.data.findIndex(n => Libflows.isSameNode(n, node))
        var flowIndex = -1
        if(nodeIndex !== -1){
          if(resp.data[nodeIndex].hasOwnProperty('z') && resp.data[nodeIndex].z){
            flowIndex = resp.data.findIndex(n => n.id === resp.data[nodeIndex].z && n.type === 'tab')
          } else if(resp.data[nodeIndex].type === 'tab') {
            flowIndex = nodeIndex
          }
        }
        if(flowIndex !== -1){
          flow = Object.assign({}, resp.data[flowIndex])
        }
        resolve(flow)
      } else {
        throw new Error('no data')
      }
    })
    .catch(reject)
  })
}

Libflows.prototype.getFlowFromId = function(id){
  if(!id){
    return Promise.reject()
  }
  return new Promise( (resolve, reject) => {
    this.locker.acquire(this.id, ()=> {
      return axios.get(`${this.nodered.url}/flow/${id}`)
    })
    .then(resp => {
      if(resp.data){
        try{
          resp.data = JSON.parse(resp.data)
        } catch(e){}
        resolve(resp.data)
      } else {
        throw new Error('no data')
      }
    })
    .catch(reject)
  })
}

Libflows.prototype.addToFlow = function(id, label, nodes = [], configs = [], discriminantNodeKeys = [], discriminantConfigKeys = []){
  if(!Array.isArray(nodes)){
    nodes = [nodes]
  }
  if(!Array.isArray(configs)){
    configs = [configs]
  }
  if(!Array.isArray(discriminantNodeKeys)){
    discriminantNodeKeys = [discriminantNodeKeys]
  }
  if(!Array.isArray(discriminantConfigKeys)){
    discriminantConfigKeys = [discriminantConfigKeys]
  }
  if(id){
    return this._addToFlow(id, label, nodes, configs, discriminantNodeKeys, discriminantConfigKeys)
  } else {
    return this._addNewFlow(label, nodes, configs)
  }
}

Libflows.prototype._addToFlow = function(id, label, nodes = [], configs = [], discriminantNodeKeys = [], discriminantConfigKeys = []){
  return new Promise( (resolve, reject) => {
    this.getFlowFromId(id)
    .then(flow => {
      if(flow === null){
        throw new Error(`Flow don't have any flow with id ${id}`)
      } else {
        if(!label){
          label = flow.label
        }

        var lastY = flow.nodes.filter(item => item.y).map(item => parseInt(item.y)).sort((a,b) => {
          if(a > b) { return -1 }
          if(a < b) { return 1 }
          return 0
        })
        if(lastY.length > 0){
          lastY = lastY[0]
        } else {
          lastY = -20
        }

        nodes = nodes.map(item => {
          if(!item.hasOwnProperty('x')){
            item.x = 170
          }
          if(!item.hasOwnProperty('y')){
            lastY = lastY + 80
            item.y = lastY
          }
        })

        var _nodes = [].concat(flow.nodes, nodes).filter(item => item)
        var _configs = [].concat(flow.configs, configs).filter(item => item)

        const nodesIds = _nodes.map(item => item.id)
        const configsIds = _configs.map(item => item.id)

        if(nodesIds.some((item, index) => nodesIds.indexOf(item) != index) === true || configsIds.some((item, index) => configsIds.indexOf(item) != index) === true){
          resolve(null)
          return
        }

        if(discriminantNodeKeys.length > 0){
          var haveDiscriminedNodeDuplicates = false
          for(var i in discriminantNodeKeys){
            var discriminedNodes = _nodes.filter(item => item.hasOwnProperty(discriminantNodeKeys[i])).map(item => item[discriminantNodeKeys[i]])
            if(discriminedNodes.some((item, index) => discriminedNodes.indexOf(item) != index) === true){
              haveDiscriminedNodeDuplicates = true
              break
            }
          }
          if(haveDiscriminedNodeDuplicates === true){
            resolve(null)
            return
          }
        }

        if(discriminantConfigKeys.length > 0){
          var haveDiscriminedConfigDuplicates = false
          for(var i in discriminantConfigKeys){
            var discriminedConfigs = _configs.filter(item => item.hasOwnProperty(discriminantConfigKeys[i])).map(item => item[discriminantConfigKeys[i]])
            if(discriminedConfigs.some((item, index) => discriminedConfigs.indexOf(item) != index) === true){
              haveDiscriminedConfigDuplicates = true
              break
            }
          }
          if(haveDiscriminedConfigDuplicates === true){
            resolve(null)
            return
          }
        }

        const zid = uuid()
        _nodes = _nodes.map(item => {
          if(item.z){
            item.z = zid
          }
          return item
        })
        _configs = _configs.map(item => {
          if(item.z){
            item.z = zid
          }
          return item
        })

        this.locker.acquire(this.id, ()=> {
          return axios.put(`${this.nodered.url}/flow/${id}`, { id: zid, label: label, nodes: _nodes, configs: _configs }, { headers: { 'Content-Type' : 'application/json; charset=utf-8' } })
        })
        .then(resp => {
          if(resp.data){
            try{
              resp.data = JSON.parse(resp.data)
            } catch(e){}
            resolve(resp.data)
          } else {
            throw new Error('no data')
          }
        })
        .catch(reject)
      }
    })
    .catch(reject)
  })
}

Libflows.prototype._addNewFlow = function(label = "", nodes = [], configs = []){
  const zid = uuid()
  _nodes = _nodes.map(item => {
    if(item.z){
      item.z = zid
    }
    return item
  })
  _configs = _configs.map(item => {
    if(item.z){
      item.z = zid
    }
    return item
  })

  if(!label){
    label = randomWord({exactly:1, wordsPerString:2, separator:'_', maxLength: 5})[0]
  }

  return new Promise( (resolve, reject) => {
    this.locker.acquire(this.id, ()=> {
      return axios.post(`${this.nodered.url}/flow`, { id, label, nodes, configs }, { headers: { 'Content-Type' : 'application/json; charset=utf-8' } })
    })
    .then(resp => {
      if(resp.data){
        try{
          resp.data = JSON.parse(resp.data)
        } catch(e){}
        resolve(resp.data.id)
      } else {
        throw new Error('no data')
      }
    })
    .catch(reject)
  })
}

Libflows.isSameNode = function(node, filter){
  const keys = Object.keys(filter)
  var resp = true
  for(var k in keys){
    if(!node.hasOwnProperty(keys[k]) || node[keys[k]] !== filter[keys[k]]){
      resp = false
      break;
    }
  }
  return resp && keys.length !== 0
}

LibFlows.generateNodeID = function(){
  return (1+Math.random()*4294967295).toString(16)
}

var instance;
module.exports = function(options) {
  if(!instance) instance = new Libflows(options);
  return instance;
}
