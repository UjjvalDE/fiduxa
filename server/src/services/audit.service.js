import AuditLog from "../models/audit-log.model.js";

// Never block the main action if audit logging fails – but report it.
export const recordAudit = async ({
  actor,
  action,
  entityType,
  entityId,
  before = null,
  after = null,
}) => {
  try {
    await AuditLog.create({
      actor,
      action,
      entityType,
      entityId,
      before,
      after,
    });
  } catch (error) {
    console.error(`Audit log failed for ${action}:`, error.message);
  }
};
