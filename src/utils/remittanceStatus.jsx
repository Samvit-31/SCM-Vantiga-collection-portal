import React from "react";
import Icon from "../components/AppIcon";

const STATUS_CONFIG = {
  SUBMITTED: {
    label: "SUBMITTED",
    className: "bg-amber-100 text-amber-700 border-amber-200",
    icon: "Clock"
  },
  VERIFIED: {
    label: "VERIFIED",
    className: "bg-green-100 text-green-700 border-green-200",
    icon: "CheckCircle"
  },
  REJECTED: {
    label: "REJECTED",
    className: "bg-red-100 text-red-700 border-red-200",
    icon: "XCircle"
  }
};

export const getRemittanceStatusBadge = (status) => {
  const key = (status || "").toUpperCase();
  const config = STATUS_CONFIG[key] || {
    label: status || "UNKNOWN",
    className: "bg-gray-100 text-gray-700 border-gray-200",
    icon: "HelpCircle"
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      <Icon name={config.icon} size={12} />
      {config.label}
    </span>
  );
};
