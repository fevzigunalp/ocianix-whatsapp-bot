import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create default tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'ocianix' },
    update: {},
    create: {
      name: 'Ocianix',
      slug: 'ocianix',
      domain: 'ocianix.com',
      plan: 'enterprise',
    },
  })
  console.log('✅ Tenant:', tenant.name)

  // Create super admin
  const adminPassword = await hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@ocianix.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@ocianix.com',
      name: 'Fevzi',
      passwordHash: adminPassword,
      role: 'super_admin',
    },
  })
  console.log('✅ Admin user:', admin.email)

  // Create default pipeline
  const pipeline = await prisma.pipeline.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: tenant.id,
      name: 'Satış Pipeline',
      isDefault: true,
    },
  })

  const stages = ['Yeni', 'İlk Temas', 'Teklif', 'Müzakere', 'Kapanış']
  const stageColors = ['#6366f1', '#3b82f6', '#f59e0b', '#ef4444', '#22c55e']
  for (let i = 0; i < stages.length; i++) {
    await prisma.pipelineStage.upsert({
      where: { id: `00000000-0000-0000-0000-00000000010${i + 1}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0000-00000000010${i + 1}`,
        tenantId: tenant.id,
        pipelineId: pipeline.id,
        name: stages[i],
        color: stageColors[i],
        position: i,
      },
    })
  }
  console.log('✅ Pipeline with', stages.length, 'stages')

  // Create default client pack
  const pack = await prisma.clientPack.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      tenantId: tenant.id,
      version: 1,
      status: 'active',
      configTier: 'advanced',
      industry: 'technology',
      businessName: 'Ocianix AI Solutions',
      websiteUrl: 'https://ocianix.com',
      tonePreset: 'professional',
      formality: 'siz',
      useEmoji: false,
      maxResponseLen: 4,
      confidenceThreshold: 60,
      maxFails: 2,
      publishedAt: new Date(),
    },
  })
  console.log('✅ Default client pack v' + pack.version)

  // Create default action definitions
  const defaultActions = [
    {
      name: 'create_lead',
      displayName: 'Lead Oluştur',
      description: 'Yeni bir lead/deal oluşturur',
      executionType: 'internal',
      executionConfig: { handler: 'create_lead' },
      parameterSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Lead başlığı' },
          value: { type: 'number', description: 'Tahmini değer' },
          currency: { type: 'string', default: 'TRY' },
        },
        required: ['title'],
      },
    },
    {
      name: 'handoff',
      displayName: 'İnsan Temsilciye Aktar',
      description: 'Konuşmayı insan temsilciye aktarır',
      executionType: 'internal',
      executionConfig: { handler: 'handoff' },
      parameterSchema: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Aktarma nedeni' },
        },
      },
    },
    {
      name: 'add_tag',
      displayName: 'Etiket Ekle',
      description: 'Müşteriye etiket ekler',
      executionType: 'internal',
      executionConfig: { handler: 'add_tag' },
      parameterSchema: {
        type: 'object',
        properties: {
          tag_name: { type: 'string', description: 'Etiket adı' },
        },
        required: ['tag_name'],
      },
    },
    {
      name: 'create_task',
      displayName: 'Görev Oluştur',
      description: 'Takip görevi oluşturur',
      executionType: 'internal',
      executionConfig: { handler: 'create_task' },
      parameterSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Görev başlığı' },
          due_at: { type: 'string', description: 'Bitiş tarihi (ISO)' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        },
        required: ['title'],
      },
    },
    {
      name: 'send_file',
      displayName: 'Dosya Gönder',
      description: 'Müşteriye dosya/katalog gönderir',
      executionType: 'internal',
      executionConfig: { handler: 'send_file' },
      parameterSchema: {
        type: 'object',
        properties: {
          file_url: { type: 'string', description: 'Dosya URL' },
          caption: { type: 'string', description: 'Dosya açıklaması' },
        },
        required: ['file_url'],
      },
    },
  ]

  for (const action of defaultActions) {
    await prisma.actionDefinition.upsert({
      where: {
        tenantId_name: { tenantId: tenant.id, name: action.name },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        ...action,
      },
    })
  }
  console.log('✅', defaultActions.length, 'default actions')

  // Create default policies
  const defaultPolicies = [
    {
      policyType: 'refuse',
      ruleText: 'Rakip firma fiyatları hakkında asla bilgi verme',
      keywords: ['rakip', 'competitor', 'karşılaştırma'],
      priority: 90,
      category: 'legal',
    },
    {
      policyType: 'collect',
      ruleText: 'Fiyat bilgisi paylaşmadan önce isim ve telefon numarası topla',
      keywords: ['fiyat', 'ücret', 'maliyet', 'price'],
      priority: 80,
      category: 'pricing',
    },
    {
      policyType: 'inform',
      ruleText: 'Fiyatlar KDV hariçtir, her zaman belirt',
      keywords: ['fiyat', 'ücret', 'teklif'],
      priority: 50,
      category: 'pricing',
    },
    {
      policyType: 'escalate',
      ruleText: 'Müşteri yasal işlem veya şikayetten bahsederse insan temsilciye aktar',
      keywords: ['avukat', 'dava', 'şikayet', 'yasal'],
      priority: 95,
      category: 'legal',
    },
  ]

  for (const policy of defaultPolicies) {
    await prisma.policy.create({
      data: {
        tenantId: tenant.id,
        packId: pack.id,
        ...policy,
      },
    })
  }
  console.log('✅', defaultPolicies.length, 'default policies')

  console.log('\n🎉 Seed completed!')
  console.log('   Login: admin@ocianix.com / admin123')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
