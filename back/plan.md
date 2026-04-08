       
  ## V1 修订计划：统一 API 聚合平台（含模型仓库、模板库、Dry Run、安全加固）                                                        
                                                                                                                                
  ### Summary                                                                                                                       
                                                                                                                                
  - 目标不变：用户输入 OpenAPI/cURL，AI 只在“生成阶段”产出确定性 Adapter；运行时纯规则执行。                                        
  - 本次增强：加入 ModelRegistry、公开模板库、Dry Run、DNS 级 SSRF 防护、Schema 版本契约、可观测 Trace。                            
  - 成功标准：可在发布前完成真实沙盒验证；可切换 LLM 供应商；可安全共享高质量模板；旧版 Adapter 在网关升级后可继续执行。            
                                                                                                                                 
  ### Key Changes                                                                                                                   
                                                                                                                                
  - 控制面（Adapter 生成）                                                                                                          
      - 新增 ModelRegistry：维护 provider/model/system_prompt/response_schema 配置，支持按工作区或全局切换主备模型。                
      - 生成链路改为：normalize input -> select model profile -> structured output -> schema/业务校验 -> draft adapter。            
      - 增加模板提交流程：is_public=false 默认；用户可申请公开，管理员审核后上架。                                                  
  - 适配器模板库（Marketplace/Gallery）                                                                                             
      - adapters 增加 is_public、review_status（private|pending|approved|rejected）、adapter_schema_version、logic_version。        
      - 新增 API：                                                                                                                  
          - GET /v1/gallery/adapters（浏览已审核模板）                                                                              
          - POST /v1/gallery/adapters/:id/clone（克隆到个人工作区并绑定自己的 secrets）                                             
  - 执行与调试                                                                                                                      
      - 新增 POST /v1/adapters/dry-run：传入 adapter_draft + payload + temp_secrets，执行真实上游请求但不落库。                     
      - temp_secrets 仅内存使用，不写数据库，不写日志明文；日志只记录 secret key 名称占位。                                         
      - 正式流转为：Generate -> Dry Run -> Publish -> Execute。                                                                     
  - 安全加固（SSRF）                                                                                                                
      - 网关请求前执行多层检查：URL 协议白名单（仅 http/https）+ 端口策略 + DNS 解析。                                              
      - 对 A/AAAA 解析结果逐个校验，命中回环、链路本地、私网、保留网段即阻断。                                                      
      - 禁止重定向到内网目标；重定向每跳重复 SSRF 校验。                                                                            
  - 契约与兼容                                                                                                                      
      - 明确双版本：                                                                                                                
          - adapter_schema_version：映射 JSON 结构版本（如 1.0）                                                                    
          - logic_version：同一 api_slug+action 的业务迭代版本（1,2,3…）                                                            
      - Runtime 加入 schema-compatible loader：按 adapter_schema_version 选择解析器与兼容层。                                       
  - 观测与审计                                                                                                                      
      - executions 扩展 trace_snapshot（非敏感转换轨迹）与 trace_enabled。                                                          
      - 轨迹内容：字段映射路径、函数调用名、输入/输出摘要（脱敏后）；默认保留 7 天。                                                
      - 统一响应 meta 增加 trace_id，便于排障关联。                                                                                 
                                                                                                                                    
  ### Public APIs / Interfaces                                                                                                      
                                                                                                                                    
  - 新增接口                                                                                                                        
      - POST /v1/adapters/dry-run                                                                                                   
      - GET /v1/gallery/adapters                                                                                                    
      - POST /v1/gallery/adapters/:id/clone                                                                                         
  - 关键类型变更                                                                                                                    
      - Adapter：新增 adapter_schema_version, logic_version, is_public, review_status                                               
      - Execution：新增 trace_snapshot, trace_enabled, trace_expire_at                                                              
      - ModelProfile：provider, model, system_prompt, schema_id, status                                                             
                                                                                                                                    
  ### Test Plan                                                                                                                     
                                                                                                                                    
  - 生成与模型管理                                                                                                                  
      - 多模型切换（主模型失败自动切备）与结构化输出一致性测试。                                                                    
      - 同一输入在不同 profile 下产物可校验且可执行。                                                                               
  - Dry Run                                                                                                                         
      - 不落库校验（adapter/secrets/execution 明文均不写入持久层）。                                                                
      - 成功、上游 4xx/5xx、超时、映射错误路径全覆盖。                                                                              
      - 首跳公网但 302 到内网时阻断。
      - adapter_schema_version=1.x 旧适配器在新 runtime 可执行。
      - logic_version 发布/回滚后行为正确。
  - Trace
      - 轨迹可定位映射错误且不含敏感值。
      - 7 天 TTL 到期自动清理。

  ### Assumptions

  - 技术栈保持 TypeScript 单体（控制面与网关逻辑分层）。
  - V1 仍不支持多步 pre_actions 编排。
  - Marketplace 仅“审核后公开”，不支持用户直接上架。
  - 密钥加密仍使用应用层 AES-GCM + 环境主密钥，KMS 作为后续演进。
